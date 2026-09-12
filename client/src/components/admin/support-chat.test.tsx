import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

const requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(Date.now()), 0);
};
const cancelAnimationFrame = (id: number) => clearTimeout(id);

Object.assign(dom.window, {
  requestAnimationFrame,
  cancelAnimationFrame,
});

Object.assign(globalThis, {
  React,
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Node: dom.window.Node,
  NodeFilter: dom.window.NodeFilter,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  EventTarget: dom.window.EventTarget,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame,
  cancelAnimationFrame,
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type TestingLibrary = typeof import("@testing-library/react");
type ReactQuery = typeof import("@tanstack/react-query");

let fireEvent: TestingLibrary["fireEvent"];
let act: TestingLibrary["act"];
let render: TestingLibrary["render"];
let waitFor: TestingLibrary["waitFor"];
let cleanup: TestingLibrary["cleanup"];
let QueryClientProvider: ReactQuery["QueryClientProvider"];
let queryClient: (typeof import("@/lib/queryClient"))["queryClient"];
let AdminSupportChat: (typeof import("./support-chat"))["default"];

const conversations = [{
  userId: 42,
  userFullName: "Test client",
  userPhone: "0000000000",
  isClosed: false,
  closedAt: null,
  messages: [
    {
      id: 1,
      userId: 42,
      senderRole: "admin" as const,
      message: "Administrator reply",
      attachmentName: null,
      attachmentMimeType: null,
      attachmentData: null,
      createdAt: "2026-09-05T00:00:00.000Z",
      editedBy: 99,
      editedAt: "2026-09-05T00:02:00.000Z",
      editedByName: "Support agent",
      userFullName: "Test client",
      userPhone: "0000000000",
    },
    {
      id: 3,
      userId: 42,
      senderRole: "admin" as const,
      message: "Legacy administrator reply",
      attachmentName: null,
      attachmentMimeType: null,
      attachmentData: null,
      createdAt: "2026-09-05T00:03:00.000Z",
      editedBy: 12345,
      editedAt: "2026-09-05T00:04:00.000Z",
      editedByName: null,
      userFullName: "Test client",
      userPhone: "0000000000",
    },
    {
      id: 2,
      userId: 42,
      senderRole: "user" as const,
      message: "Client message",
      attachmentName: null,
      attachmentMimeType: null,
      attachmentData: null,
      createdAt: "2026-09-05T00:01:00.000Z",
      editedBy: null,
      editedAt: null,
      editedByName: null,
      userFullName: "Test client",
      userPhone: "0000000000",
    },
  ],
}];

const originalFetch = globalThis.fetch;
let responseConversations: Array<Record<string, any>> = conversations;
let requests: Array<{ url: string; method: string }> = [];

beforeEach(async () => {
  const testingLibrary = await import("@testing-library/react");
  const reactQuery = await import("@tanstack/react-query");
  const queryClientModule = await import("@/lib/queryClient");
  const supportChatModule = await import("./support-chat");

  fireEvent = testingLibrary.fireEvent;
  act = testingLibrary.act;
  render = testingLibrary.render;
  waitFor = testingLibrary.waitFor;
  cleanup = testingLibrary.cleanup;
  QueryClientProvider = reactQuery.QueryClientProvider;
  queryClient = queryClientModule.queryClient;
  AdminSupportChat = supportChatModule.default;

  const defaultOptions = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...defaultOptions,
    queries: { ...defaultOptions.queries, gcTime: 0 },
    mutations: { ...defaultOptions.mutations, gcTime: 0 },
  });
  queryClient.clear();
  document.body.innerHTML = "";
  responseConversations = conversations;
  requests = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    requests.push({ url, method });

    if (method === "GET") {
      if (url.includes("/history")) {
        return new Response(JSON.stringify([{
          id: 1,
          messageId: 1,
          previousMessage: "Original administrator reply",
          editedBy: 99,
          editedAt: "2026-09-05T00:02:00.000Z",
          editedByName: "Support agent",
        }]), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(responseConversations), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/admin/support/conversations/")) {
      const userId = Number(url.split("/").pop());
      responseConversations = responseConversations.map((conversation) =>
        conversation.userId === userId
          ? { ...conversation, isClosed: true, closedAt: "2026-09-05T00:05:00.000Z" }
          : conversation,
      );
      return new Response(JSON.stringify({ isClosed: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: "The server rejected this edit" }), {
      status: 422,
      headers: { "content-type": "application/json" },
    });
  };
});

afterEach(async () => {
  cleanup();
  await queryClient.cancelQueries({ queryKey: ["/api/admin/support/conversations"] });
  queryClient.removeQueries({ queryKey: ["/api/admin/support/conversations"] });
  queryClient.clear();
  queryClient.getMutationCache().clear();
  globalThis.fetch = originalFetch;
});

function renderSupportChat() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminSupportChat />
    </QueryClientProvider>,
  );
}

async function openSupportConversation() {
  fireEvent.click(document.querySelector('[data-testid="button-view-all-support"]') as HTMLButtonElement);
  await waitFor(() => {
    assert.ok(document.querySelector('[data-testid="button-support-user-42"]'));
  });
  fireEvent.click(document.querySelector('[data-testid="button-support-user-42"]') as HTMLButtonElement);
}

function makeConversation(
  userId: number,
  userFullName: string,
  messages: Array<{
    id: number;
    senderRole: "user" | "admin";
    message: string;
    createdAt: string;
  }>,
  isClosed = false,
) {
  return {
    userId,
    userFullName,
    userPhone: `000000000${userId}`,
    isClosed,
    closedAt: isClosed ? "2026-09-05T00:04:00.000Z" : null,
    unreadCount: messages.filter((message) => message.senderRole === "user").length,
    messages: messages.map((message) => ({
      ...message,
      attachmentName: null,
      attachmentMimeType: null,
      attachmentData: null,
      editedBy: null,
      editedAt: null,
      editedByName: null,
      userFullName,
      userPhone: `000000000${userId}`,
    })),
  };
}

test("keeps pending, open, closed, and all support views accurate", async () => {
  responseConversations = [
    makeConversation(10, "Pending client", [
      { id: 10, senderRole: "user", message: "I need help", createdAt: "2026-09-05T00:01:00.000Z" },
    ]),
    makeConversation(11, "Active client", [
      { id: 11, senderRole: "user", message: "Initial question", createdAt: "2026-09-05T00:01:00.000Z" },
      { id: 12, senderRole: "admin", message: "Administrator reply", createdAt: "2026-09-05T00:02:00.000Z" },
    ]),
    makeConversation(12, "Closed client", [
      { id: 13, senderRole: "user", message: "Earlier question", createdAt: "2026-09-05T00:01:00.000Z" },
      { id: 14, senderRole: "admin", message: "Closed reply", createdAt: "2026-09-05T00:02:00.000Z" },
    ], true),
  ];

  renderSupportChat();
  fireEvent.click(document.querySelector('[data-testid="button-view-all-support"]') as HTMLButtonElement);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  assert.ok(document.querySelector('[data-testid="button-support-user-10"]'));

  assert.match(document.body.textContent || "", /En attente \(1\)/);
  assert.match(document.body.textContent || "", /En cours \(1\)/);
  assert.match(document.body.textContent || "", /Fermées \(1\)/);
  assert.match(document.body.textContent || "", /Toutes \(3\)/);

  fireEvent.click(document.querySelector('[data-testid="button-support-filter-pending"]') as HTMLButtonElement);
  assert.ok(document.querySelector('[data-testid="button-support-user-10"]'));
  assert.equal(document.querySelector('[data-testid="button-support-user-11"]'), null);
  assert.equal(document.querySelector('[data-testid="button-support-user-12"]'), null);

  fireEvent.click(document.querySelector('[data-testid="button-support-filter-open"]') as HTMLButtonElement);
  assert.equal(document.querySelector('[data-testid="button-support-user-10"]'), null);
  assert.ok(document.querySelector('[data-testid="button-support-user-11"]'));
  assert.equal(document.querySelector('[data-testid="button-support-user-12"]'), null);
  fireEvent.click(document.querySelector('[data-testid="button-support-user-11"]') as HTMLButtonElement);
  fireEvent.click(document.querySelector('[aria-label="Fermer le chat"]') as HTMLButtonElement);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  assert.equal(document.querySelector('[data-testid="button-support-user-11"]'), null);

  fireEvent.click(document.querySelector('[data-testid="button-support-filter-closed"]') as HTMLButtonElement);
  assert.ok(document.querySelector('[data-testid="button-support-user-11"]'));
  assert.ok(document.querySelector('[data-testid="button-support-user-12"]'));
  fireEvent.click(document.querySelector('[data-testid="button-support-user-11"]') as HTMLButtonElement);
  assert.match(document.body.textContent || "", /Administrator reply/);

  fireEvent.click(document.querySelector('[data-testid="button-support-filter-all"]') as HTMLButtonElement);
  assert.ok(document.querySelector('[data-testid="button-support-user-10"]'));
  assert.ok(document.querySelector('[data-testid="button-support-user-11"]'));
  assert.ok(document.querySelector('[data-testid="button-support-user-12"]'));
});

test("shows edit controls for administrator replies but not client messages", async () => {
  renderSupportChat();
  await openSupportConversation();

  await waitFor(() => {
    assert.ok(document.querySelector('[data-testid="button-edit-support-message-1"]'));
  });

  assert.ok(document.querySelector('[data-testid="button-edit-support-message-1"]'));
  assert.equal(document.querySelector('[data-testid="button-edit-support-message-2"]'), null);
});

test("blocks blank edits and shows the server error when an edit fails", async () => {
  renderSupportChat();
  await openSupportConversation();

  await waitFor(() => {
    assert.ok(document.querySelector('[data-testid="button-edit-support-message-1"]'));
  });

  fireEvent.click(document.querySelector('[data-testid="button-edit-support-message-1"]') as HTMLButtonElement);
  const editor = document.querySelector('[data-testid="input-edit-support-message-1"]') as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: "   " } });

  const saveButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("Enregistrer")) as HTMLButtonElement;
  assert.equal(saveButton.disabled, true);
  fireEvent.click(saveButton);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests.filter(({ method, url }) => method === "PATCH" && url.includes("/messages/")).length, 0);

  fireEvent.change(editor, { target: { value: "Updated administrator reply" } });
  fireEvent.click(saveButton);

  await waitFor(() => {
    assert.match(document.body.textContent || "", /The server rejected this edit/);
  });
  assert.equal(requests.filter(({ method, url }) => method === "PATCH" && url.includes("/messages/")).length, 1);
});

test("opens the immutable edit history for an edited administrator reply", async () => {
  renderSupportChat();
  await openSupportConversation();

  await waitFor(() => {
    assert.ok(document.querySelector('[data-testid="button-view-support-history-1"]'));
  });

  fireEvent.click(document.querySelector('[data-testid="button-view-support-history-1"]') as HTMLButtonElement);

  await waitFor(() => {
    assert.match(document.body.textContent || "", /Original administrator reply/);
  });
  assert.equal(requests.filter(({ method, url }) => method === "GET" && url.includes("/history")).length, 1);
  assert.match(document.body.textContent || "", /Support agent/);
});

test("labels an edited message when its editor account is no longer available", async () => {
  renderSupportChat();
  await openSupportConversation();

  await waitFor(() => {
    assert.match(document.body.textContent || "", /administrateur dont le compte est introuvable/);
  });
});

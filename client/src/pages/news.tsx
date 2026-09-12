import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import { Eye, Heart, Loader2, Newspaper, ChevronLeft } from "lucide-react";

interface NewsPost {
  id: number;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
  likesCount: number;
  viewsCount: number;
  likedByUser: boolean;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function NewsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const viewedPostIds = useRef(new Set<number>());

  const { data: posts = [], isLoading } = useQuery<NewsPost[]>({
    queryKey: ["/api/news"],
  });

  useEffect(() => {
    for (const post of posts) {
      if (viewedPostIds.current.has(post.id)) continue;
      viewedPostIds.current.add(post.id);
      void apiRequest("POST", `/api/news/${post.id}/view`, {});
    }
  }, [posts]);

  const likeMutation = useMutation({
    mutationFn: async (postId: number) => {
      const response = await apiRequest("POST", `/api/news/${postId}/like`, {});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de modifier le like");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  return (
    <main className="news-page min-h-full bg-[#D9D9D9] bottom-nav-clearance">
      <style>{`
        .news-page {
          color: #151515;
          font-family: Arial, Helvetica, sans-serif;
        }
        .news-page .news-screen {
          width: 100%;
          max-width: 500px;
          min-height: calc(100dvh - 59px);
          margin: 0 auto;
        }
        .news-page .news-header {
          display: flex;
          height: 74px;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #e3eeee;
          padding: 0 18px;
          background: #EAEAEA;
        }
        .news-page .back-button {
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: #effafa;
          color: #C00000;
        }
        .news-page .news-title {
          margin: 0;
          color: #C00000;
          font-size: 21px;
          font-weight: 700;
        }
        .news-page .news-content {
          padding: 18px 16px 30px;
        }
        .news-page .news-intro {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 14px;
          color: #536768;
          font-size: 13px;
        }
        .news-page .news-intro svg {
          width: 19px;
          height: 19px;
          color: #FF0000;
        }
        .news-page .news-card {
          overflow: hidden;
          margin-top: 12px;
          border: 1px solid #deeded;
          border-radius: 15px;
          background: #EAEAEA;
          box-shadow: 0 2px 7px rgba(0, 126, 149, .07);
          cursor: pointer;
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .news-page .news-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 126, 149, .12);
        }
        .news-page .news-image {
          display: block;
          width: 100%;
          max-height: 260px;
          object-fit: cover;
        }
        .news-page .news-card-body {
          padding: 15px 16px 12px;
        }
        .news-page .news-card-title {
          margin: 0 0 8px;
          color: #C00000;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.2;
        }
        .news-page .news-card-text {
          margin: 0;
          color: #303b3c;
          font-size: 14px;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .news-page .news-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #eef4f4;
          padding: 10px 16px 12px;
          color: #778485;
          font-size: 12px;
        }
        .news-page .news-stats {
          display: flex;
          align-items: center;
          gap: 13px;
        }
        .news-page .news-stat {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .news-page .news-stat svg {
          width: 15px;
          height: 15px;
        }
        .news-page .news-like {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 0;
          padding: 3px 0;
          background: transparent;
          color: #798687;
          font-size: 12px;
        }
        .news-page .news-like.liked {
          color: #e14465;
          font-weight: 700;
        }
        .news-page .news-like svg {
          width: 18px;
          height: 18px;
        }
        .news-page .news-empty {
          display: flex;
          min-height: 300px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px dashed #b8d8da;
          border-radius: 15px;
          padding: 25px;
          background: #EAEAEA;
          color: #6d7a7b;
          font-size: 14px;
          text-align: center;
        }
        .news-page .news-empty svg {
          width: 36px;
          height: 36px;
          margin-bottom: 10px;
          color: #FF0000;
        }
      `}</style>

      <div className="news-screen">
        <header className="news-header">
          <button
            type="button"
            className="back-button"
            onClick={() => navigate("/account")}
            aria-label="Retour à Mon compte"
            data-testid="button-news-back"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <h1 className="news-title">Actualités</h1>
        </header>

        <section className="news-content" aria-label="Annonces et actualités">
          <p className="news-intro">
            <Newspaper aria-hidden="true" />
            Retrouvez ici les dernières annonces de HSBC.
          </p>

          {isLoading ? (
            <RefreshLoader />
          ) : posts.length === 0 ? (
            <div className="news-empty">
              <Newspaper aria-hidden="true" />
              Aucune actualité publiée pour le moment.
            </div>
          ) : (
            posts.map((post) => (
              <article
                className="news-card"
                key={post.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/news/${post.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/news/${post.id}`);
                  }
                }}
                data-testid={`news-card-${post.id}`}
              >
                {post.imageUrl && (
                  <img className="news-image" src={post.imageUrl} alt={post.title || "Illustration de l'annonce"} />
                )}
                <div className="news-card-body">
                  {post.title && <h2 className="news-card-title">{post.title}</h2>}
                  <p className="news-card-text">{post.content}</p>
                </div>
                <footer className="news-card-footer">
                  <span>{formatDate(post.createdAt)}</span>
                  <div className="news-stats">
                    <span className="news-stat" aria-label={`${post.viewsCount} vues`}>
                      <Eye aria-hidden="true" /> {post.viewsCount}
                    </span>
                    <button
                      type="button"
                      className={`news-like${post.likedByUser ? " liked" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        likeMutation.mutate(post.id);
                      }}
                      disabled={likeMutation.isPending}
                      aria-label={post.likedByUser ? "Retirer le like" : "Aimer cette actualité"}
                      data-testid={`button-news-like-${post.id}`}
                    >
                      <Heart fill={post.likedByUser ? "currentColor" : "none"} aria-hidden="true" />
                      {post.likesCount}
                    </button>
                  </div>
                </footer>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

export function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const postId = Number(id);

  const { data: posts = [], isLoading } = useQuery<NewsPost[]>({
    queryKey: ["/api/news"],
  });
  const post = posts.find((item) => item.id === postId);

  useEffect(() => {
    if (!post || !Number.isInteger(postId)) return;
    void apiRequest("POST", `/api/news/${post.id}/view`, {});
  }, [post, postId]);

  const likeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/news/${postId}/like`, {});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de modifier le like");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  return (
    <main className="news-page news-detail-page min-h-full bg-[#D9D9D9] bottom-nav-clearance">
      <style>{`
        .news-detail-page .news-detail-screen {
          width: 100%;
          max-width: 500px;
          min-height: calc(100dvh - 59px);
          margin: 0 auto;
        }
        .news-detail-page .news-detail-header {
          display: flex;
          height: 74px;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #e3eeee;
          padding: 0 18px;
          background: #EAEAEA;
        }
        .news-detail-page .back-button {
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: #effafa;
          color: #C00000;
        }
        .news-detail-page .news-title {
          margin: 0;
          color: #C00000;
          font-size: 21px;
          font-weight: 700;
        }
        .news-detail-page .news-detail-body {
          overflow: hidden;
          margin: 16px;
          border: 1px solid #deeded;
          border-radius: 16px;
          background: #EAEAEA;
          box-shadow: 0 2px 8px rgba(0, 126, 149, .08);
        }
        .news-detail-page .news-detail-image {
          display: block;
          width: 100%;
          max-height: 350px;
          object-fit: cover;
        }
        .news-detail-page .news-detail-content {
          padding: 20px 18px 24px;
        }
        .news-detail-page .news-detail-title {
          margin: 0 0 10px;
          color: #C00000;
          font-size: 23px;
          font-weight: 700;
          line-height: 1.25;
        }
        .news-detail-page .news-detail-date {
          margin: 0 0 18px;
          color: #7a8889;
          font-size: 12px;
        }
        .news-detail-page .news-detail-text {
          margin: 0;
          color: #303b3c;
          font-size: 15px;
          line-height: 1.75;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .news-detail-page .news-detail-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 22px;
          border-top: 1px solid #eef4f4;
          padding-top: 14px;
          color: #778485;
          font-size: 13px;
        }
        .news-detail-page .news-stat {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .news-detail-page .news-stat svg {
          width: 16px;
          height: 16px;
        }
        .news-detail-page .news-detail-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .news-detail-page .news-detail-like {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 0;
          padding: 3px 0;
          background: transparent;
          color: #798687;
          font-size: 13px;
        }
        .news-detail-page .news-detail-like.liked {
          color: #e14465;
          font-weight: 700;
        }
        .news-detail-page .news-detail-empty {
          margin: 16px;
          border: 1px dashed #b8d8da;
          border-radius: 15px;
          padding: 35px 20px;
          background: #fff;
          color: #6d7a7b;
          text-align: center;
        }
      `}</style>

      <div className="news-detail-screen">
        <header className="news-detail-header">
          <button
            type="button"
            className="back-button"
            onClick={() => navigate("/news")}
            aria-label="Retour aux actualités"
            data-testid="button-news-detail-back"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <h1 className="news-title">Actualités</h1>
        </header>

        {isLoading ? (
          <RefreshLoader />
        ) : !post ? (
          <div className="news-detail-empty">
            Cette actualité n'est plus disponible.
          </div>
        ) : (
          <article className="news-detail-body" data-testid={`news-detail-${post.id}`}>
            {post.imageUrl && (
              <img
                className="news-detail-image"
                src={post.imageUrl}
                alt={post.title || "Illustration de l'annonce"}
              />
            )}
            <div className="news-detail-content">
              {post.title && <h2 className="news-detail-title">{post.title}</h2>}
              <p className="news-detail-date">{formatDate(post.createdAt)}</p>
              <p className="news-detail-text">{post.content}</p>
              <footer className="news-detail-footer">
                <span className="news-stat" aria-label={`${post.viewsCount} vues`}>
                  <Eye aria-hidden="true" /> {post.viewsCount} vue{post.viewsCount === 1 ? "" : "s"}
                </span>
                <div className="news-detail-actions">
                  <button
                    type="button"
                    className={`news-detail-like${post.likedByUser ? " liked" : ""}`}
                    onClick={() => likeMutation.mutate()}
                    disabled={likeMutation.isPending}
                    aria-label={post.likedByUser ? "Retirer le like" : "Aimer cette actualité"}
                    data-testid={`button-news-detail-like-${post.id}`}
                  >
                    <Heart fill={post.likedByUser ? "currentColor" : "none"} aria-hidden="true" />
                    {post.likesCount}
                  </button>
                </div>
              </footer>
            </div>
          </article>
        )}
      </div>
    </main>
  );
}
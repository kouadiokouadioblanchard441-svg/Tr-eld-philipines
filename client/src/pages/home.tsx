import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import AboutModal from "@/components/about-modal";

import announcementIcon from "@assets/téléchargement_(91)_1787514048111.png";
import rechargeButtonImage from "@assets/20260124_173540_1787507650481.png";
import exchangeButtonImage from "@assets/20260124_173432_1787507650509_echanger.png";
import hsbcLogo from "@assets/IMG_20260911_192520_526_1789155009576.jpg";
import bannerMeeting01 from "@assets/image_search/hsbc-banner-meeting-01.jpg";
import bannerMeeting02 from "@assets/image_search/hsbc-banner-meeting-02.jpg";
import bannerMeeting03 from "@assets/image_search/hsbc-banner-meeting-03.jpg";
import bannerOffice01 from "@assets/image_search/hsbc-banner-office-01.jpg";
import bannerOffice02 from "@assets/image_search/hsbc-banner-office-02.jpg";
import bannerOffice03 from "@assets/image_search/hsbc-banner-office-03.jpg";
import bannerOffice04 from "@assets/image_search/hsbc-banner-office-04.jpg";
import bannerOffice05 from "@assets/image_search/hsbc-banner-office-05.jpg";

const bannerImages = [
  { src: bannerMeeting01, alt: "Réunion d'équipe HSBC" },
  { src: bannerMeeting02, alt: "Collaboration de l'équipe HSBC" },
  { src: bannerMeeting03, alt: "Équipe HSBC en réunion" },
  { src: bannerOffice01, alt: "Bureau de la nouvelle entreprise HSBC" },
  { src: bannerOffice02, alt: "Espace de travail HSBC" },
  { src: bannerOffice03, alt: "Réunion dans les bureaux HSBC" },
  { src: bannerOffice04, alt: "Équipe HSBC au travail" },
  { src: bannerOffice05, alt: "Structure moderne de l'entreprise HSBC" },
];

function formatAmount(value: number) {
  return value.toLocaleString("fr-FR");
}

interface HomeNewsPost {
  id: number;
  title: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

function formatNewsDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getNewsExcerpt(content: string) {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > 72 ? `${singleLine.slice(0, 72).trim()}...` : singleLine;
}

export default function HomePage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(true);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const { data: newsPosts = [] } = useQuery<HomeNewsPost[]>({
    queryKey: ["/api/news"],
  });

  useEffect(() => {
    const handleHomeTabClick = () => setIsWelcomeOpen(true);
    window.addEventListener("home-tab-clicked", handleHomeTabClick);
    return () => window.removeEventListener("home-tab-clicked", handleHomeTabClick);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveBannerIndex((current) => (current + 1) % bannerImages.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  if (!user) return null;

  const balance = Number(user.balance || 0);
  const cumulative = Number(user.totalEarnings || 0);

  return (
    <>
      <main className="teld-dashboard-reference" aria-label="HSBC home">
      <style>{`
        .teld-dashboard-reference {
          min-height: 100dvh;
          overflow-x: hidden;
          background: #EAEAEA;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }
        .teld-dashboard-reference *,
        .teld-dashboard-reference *::before,
        .teld-dashboard-reference *::after {
          box-sizing: border-box;
        }
        .teld-dashboard-reference__screen {
          width: 100%;
          max-width: 512px;
          min-height: 100dvh;
          margin: 0 auto;
           padding: 0 0 calc(59px + env(safe-area-inset-bottom));
          background: #EAEAEA;
        }
        .teld-dashboard-reference__brand {
          width: calc(100% - clamp(30px, 8.6vw, 44px));
          height: clamp(64px, 17vw, 86px);
          margin: 0 auto clamp(12px, 3.1vw, 16px);
          overflow: hidden;
          border: 1px solid rgba(192, 0, 0, .12);
          border-radius: clamp(9px, 2.35vw, 12px);
          background: #fff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, .06);
        }
        .teld-dashboard-reference__brand-track {
          display: flex;
          width: max-content;
          height: 100%;
          animation: hsbc-brand-scroll 10s linear infinite;
        }
        .teld-dashboard-reference__brand-group {
          display: flex;
          height: 100%;
          flex: 0 0 auto;
          align-items: center;
          gap: clamp(4px, 1.2vw, 8px);
        }
        .teld-dashboard-reference__brand-slide {
          display: flex;
          width: clamp(170px, 42vw, 210px);
          height: 100%;
          flex: 0 0 clamp(170px, 42vw, 210px);
          align-items: center;
          justify-content: center;
        }
        .teld-dashboard-reference__brand-slide img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        @keyframes hsbc-brand-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .teld-dashboard-reference__hero {
           position: relative;
          width: calc(100% - clamp(30px, 8.6vw, 44px));
          aspect-ratio: 165 / 140;
          margin: 0 auto;
          overflow: hidden;
          border-radius: clamp(9px, 2.35vw, 12px);
          background: #eaf0ff;
        }
        .teld-dashboard-reference__hero-track {
           display: flex;
           width: 100%;
           height: 100%;
           transform: translateX(-${activeBannerIndex * 100}%);
           transition: transform 700ms cubic-bezier(.22, .61, .36, 1);
        }
        .teld-dashboard-reference__hero-slide {
           display: block;
           width: 100%;
           height: 100%;
           flex: 0 0 100%;
        }
        .teld-dashboard-reference__hero img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .teld-dashboard-reference__hero-dots {
           display: flex;
           position: absolute;
           right: 0;
           bottom: 10px;
           left: 0;
           z-index: 1;
           justify-content: center;
           gap: 5px;
        }
        .teld-dashboard-reference__hero-dot {
           width: 6px;
           height: 6px;
           border: 0;
           border-radius: 50%;
           padding: 0;
           background: rgba(255, 255, 255, .55);
           transition: width 180ms ease, background 180ms ease;
        }
        .teld-dashboard-reference__hero-dot--active {
           width: 18px;
           border-radius: 999px;
           background: #FF0000;
        }
        .teld-dashboard-reference__announcement {
          display: flex;
          width: calc(100% - clamp(30px, 8.6vw, 44px));
          height: clamp(34px, 9.1vw, 47px);
          align-items: center;
          gap: clamp(7px, 1.95vw, 10px);
          margin: clamp(11px, 3.1vw, 16px) auto 0;
          overflow: hidden;
          border-radius: clamp(6px, 1.55vw, 8px);
          padding: 0 clamp(8px, 2.35vw, 12px);
          background: #f5f5f5;
          box-shadow: 0 1px 4px rgba(0, 0, 0, .035);
        }
        .teld-dashboard-reference__announcement-icon {
          width: clamp(20px, 5.45vw, 28px);
          height: auto;
          flex: 0 0 auto;
          object-fit: contain;
        }
        .teld-dashboard-reference__announcement-window {
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }
        .teld-dashboard-reference__announcement-track {
          display: flex;
          width: max-content;
          align-items: center;
          color: #5a5a5a;
          font-size: clamp(12px, 3.5vw, 18px);
          font-weight: 400;
          line-height: 1;
          white-space: nowrap;
          animation: teld-dashboard-marquee 18s linear infinite;
        }
        .teld-dashboard-reference__announcement-track span {
          padding-right: 56px;
        }
        @keyframes teld-dashboard-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .teld-dashboard-reference__metrics {
          display: grid;
          gap: clamp(15px, 4.3vw, 22px);
          width: calc(100% - clamp(28px, 7.8vw, 40px));
          margin: clamp(16px, 4.5vw, 23px) auto 0;
        }
        .teld-dashboard-reference__metric {
          display: grid;
          min-height: clamp(108px, 30vw, 154px);
          grid-template-columns: minmax(0, 63.5%) minmax(120px, 36.5%);
          align-items: start;
          overflow: hidden;
          border: 1px solid #f3f3f3;
          border-radius: clamp(5px, 1.2vw, 7px);
          background: #EAEAEA;
          box-shadow: 0 2px 9px rgba(0, 0, 0, .05);
          transition: transform 130ms ease, box-shadow 130ms ease;
        }
        .teld-dashboard-reference__metric:hover {
          box-shadow: 0 4px 13px rgba(0, 0, 0, .075);
        }
        .teld-dashboard-reference__metric:active {
          transform: scale(.992);
          box-shadow: 0 1px 4px rgba(0, 0, 0, .05);
        }
        .teld-dashboard-reference__station {
          display: flex;
          height: 100%;
          align-items: flex-start;
          justify-content: center;
          overflow: hidden;
          padding: clamp(20px, 5.2vw, 28px) clamp(4px, 1vw, 6px) 8px;
        }
        .teld-dashboard-reference__station img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .teld-dashboard-reference__quick-action {
           display: block;
           width: min(100%, 240px);
           overflow: hidden;
           border: 0;
           border-radius: 24px;
           padding: 0;
           background: transparent;
           line-height: 0;
           cursor: pointer;
           transition: transform 120ms ease, filter 120ms ease;
        }
        .teld-dashboard-reference__quick-action img {
           display: block;
           width: 100%;
           height: auto;
           aspect-ratio: 3.63;
           object-fit: fill;
        }
        .teld-dashboard-reference__quick-action:hover {
           filter: brightness(1.03);
        }
        .teld-dashboard-reference__quick-action:active {
           transform: scale(.98);
        }
        .teld-dashboard-reference__quick-action:focus-visible {
           outline: 3px solid #C00000;
           outline-offset: 2px;
        }
        .teld-dashboard-reference__station--equipment {
          justify-content: center;
          padding: clamp(20px, 5.2vw, 28px) clamp(4px, 1vw, 6px) 8px;
        }
        .teld-dashboard-reference__metric-copy {
          display: flex;
          min-width: 0;
          align-items: center;
          flex-direction: column;
          justify-content: flex-start;
          gap: clamp(15px, 4.3vw, 22px);
          padding: clamp(20px, 5.2vw, 28px) clamp(7px, 1.8vw, 10px) 8px 0;
          text-align: center;
        }
        .teld-dashboard-reference__metric-label {
          display: inline-grid;
          min-width: clamp(109px, 28vw, 145px);
          min-height: clamp(42px, 11.6vw, 60px);
          place-items: center;
          border: clamp(2px, .55vw, 3px) solid #151515;
          border-radius: 1px;
          padding: 2px 7px;
          background: #ffc000;
          box-shadow: inset 0 0 0 1px rgba(255, 241, 148, .35), 0 1px 2px rgba(0, 0, 0, .22);
          color: #171717;
          font-size: clamp(17px, 5vw, 26px);
          font-weight: 400;
          line-height: 1;
        }
        .teld-dashboard-reference__metric-value {
          display: block;
          max-width: 100%;
          color: #db2222;
          font-size: clamp(17px, 4.8vw, 25px);
          font-weight: 400;
          line-height: 1;
          white-space: nowrap;
        }
        .teld-dashboard-reference__metric-value small {
          font-size: .76em;
          font-weight: inherit;
        }
        .teld-dashboard-reference__news {
          width: calc(100% - clamp(28px, 7.8vw, 40px));
          margin: clamp(25px, 6.8vw, 35px) auto 0;
        }
        .teld-dashboard-reference__news-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: clamp(13px, 3.7vw, 19px);
        }
        .teld-dashboard-reference__news-heading h2 {
          margin: 0;
          color: #151515;
          font-size: clamp(18px, 5.2vw, 25px);
          font-weight: 700;
          line-height: 1;
        }
        .teld-dashboard-reference__news-heading button {
          border: 0;
          padding: 4px 0;
          background: transparent;
          color: #C00000;
          font-size: clamp(13px, 3.5vw, 17px);
          font-weight: 500;
        }
        .teld-dashboard-reference__news-list {
          display: grid;
          gap: clamp(14px, 4vw, 20px);
        }
        .teld-dashboard-reference__news-card {
          display: grid;
          width: 100%;
          grid-template-columns: clamp(100px, 27vw, 138px) minmax(0, 1fr);
          gap: clamp(12px, 3.5vw, 18px);
          align-items: center;
          border: 0;
          padding: 0;
          background: transparent;
          color: #151515;
          text-align: left;
          cursor: pointer;
        }
        .teld-dashboard-reference__news-card:focus-visible {
          outline: 2px solid #FF0000;
          outline-offset: 5px;
          border-radius: 10px;
        }
        .teld-dashboard-reference__news-image,
        .teld-dashboard-reference__news-placeholder {
          display: block;
          width: 100%;
          height: clamp(96px, 26vw, 130px);
          border-radius: clamp(9px, 2.3vw, 12px);
        }
        .teld-dashboard-reference__news-image {
          object-fit: cover;
          background: #e8f1f2;
        }
        .teld-dashboard-reference__news-placeholder {
          display: grid;
          place-items: center;
          background: #e8f1f2;
          color: #FF0000;
          font-size: clamp(22px, 6vw, 30px);
          font-weight: 700;
        }
        .teld-dashboard-reference__news-copy {
          min-width: 0;
        }
        .teld-dashboard-reference__news-title {
          display: -webkit-box;
          margin: 0 0 7px;
          overflow: hidden;
          color: #171717;
          font-size: clamp(14px, 4vw, 19px);
          font-weight: 700;
          line-height: 1.18;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .teld-dashboard-reference__news-date,
        .teld-dashboard-reference__news-excerpt {
          display: -webkit-box;
          overflow: hidden;
          color: #717171;
          font-size: clamp(12px, 3.4vw, 16px);
          line-height: 1.35;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
        }
        .teld-dashboard-reference__news-date {
          margin-bottom: 5px;
        }
        .teld-dashboard-reference__news-excerpt {
          -webkit-line-clamp: 2;
        }
        @media (max-width: 340px) {
          .teld-dashboard-reference__news-card {
            grid-template-columns: 90px minmax(0, 1fr);
            gap: 10px;
          }
          .teld-dashboard-reference__news-image,
          .teld-dashboard-reference__news-placeholder {
            height: 90px;
          }
        }
        @media (max-width: 340px) {
          .teld-dashboard-reference__metric {
            grid-template-columns: minmax(0, 59%) minmax(117px, 41%);
          }
          .teld-dashboard-reference__metric-copy {
            gap: 11px;
          }
          .teld-dashboard-reference__metric-label {
            min-width: 104px;
          }
          .teld-dashboard-reference__station--equipment {
            padding-right: 13px;
            padding-left: 13px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .teld-dashboard-reference__announcement-track {
            animation: none;
          }
          .teld-dashboard-reference__brand-track {
            animation: none;
          }
        }
      `}</style>

      <div className="teld-dashboard-reference__screen">
        <div className="teld-dashboard-reference__brand" aria-label="Logo HSBC">
          <div className="teld-dashboard-reference__brand-track">
            <div className="teld-dashboard-reference__brand-group">
              <div className="teld-dashboard-reference__brand-slide">
                <img src={hsbcLogo} alt="HSBC" />
              </div>
              <div className="teld-dashboard-reference__brand-slide" aria-hidden="true">
                <img src={hsbcLogo} alt="" />
              </div>
              <div className="teld-dashboard-reference__brand-slide" aria-hidden="true">
                <img src={hsbcLogo} alt="" />
              </div>
            </div>
            <div className="teld-dashboard-reference__brand-group" aria-hidden="true">
              <div className="teld-dashboard-reference__brand-slide">
                <img src={hsbcLogo} alt="" />
              </div>
              <div className="teld-dashboard-reference__brand-slide">
                <img src={hsbcLogo} alt="" />
              </div>
              <div className="teld-dashboard-reference__brand-slide">
                <img src={hsbcLogo} alt="" />
              </div>
            </div>
          </div>
        </div>
        <section className="teld-dashboard-reference__hero" aria-label="Bannière HSBC">
          <div className="teld-dashboard-reference__hero-track">
            {bannerImages.map((image) => (
              <div className="teld-dashboard-reference__hero-slide" key={image.src}>
                <img src={image.src} alt={image.alt} />
              </div>
            ))}
          </div>
          <div className="teld-dashboard-reference__hero-dots" aria-label="Images de la bannière">
            {bannerImages.map((image, index) => (
              <button
                key={image.src}
                type="button"
                className={`teld-dashboard-reference__hero-dot${index === activeBannerIndex ? " teld-dashboard-reference__hero-dot--active" : ""}`}
                onClick={() => setActiveBannerIndex(index)}
                aria-label={`Afficher l'image ${index + 1}`}
                aria-current={index === activeBannerIndex ? "true" : undefined}
              />
            ))}
          </div>
        </section>

        <section className="teld-dashboard-reference__announcement" aria-label="Annonce de recharges">
          <img className="teld-dashboard-reference__announcement-icon" src={announcementIcon} alt="" aria-hidden="true" />
          <div className="teld-dashboard-reference__announcement-window">
            <div className="teld-dashboard-reference__announcement-track" aria-live="off">
              <span>J6 topped up 100,000 ******1047 topped up 90,000</span>
              <span aria-hidden="true">J6 topped up 100,000 ******1047 topped up 90,000</span>
            </div>
          </div>
        </section>

        <section className="teld-dashboard-reference__metrics" aria-label="Account summary">
          <article className="teld-dashboard-reference__metric">
            <div className="teld-dashboard-reference__station">
              <button
                type="button"
                className="teld-dashboard-reference__quick-action"
                onClick={() => navigate("/deposit")}
                aria-label="Recharger"
                data-testid="button-home-recharge"
              >
                <img src={rechargeButtonImage} alt="Recharger" />
              </button>
            </div>
            <div className="teld-dashboard-reference__metric-copy">
              <span className="teld-dashboard-reference__metric-label">Balance</span>
              <strong className="teld-dashboard-reference__metric-value"><small>GPB </small>{formatAmount(balance)}</strong>
            </div>
          </article>

          <article className="teld-dashboard-reference__metric">
            <div className="teld-dashboard-reference__station teld-dashboard-reference__station--equipment">
              <button
                type="button"
                className="teld-dashboard-reference__quick-action"
                onClick={() => navigate("/withdrawal")}
                aria-label="Échanger"
                data-testid="button-home-exchange"
              >
                <img src={exchangeButtonImage} alt="Échanger" />
              </button>
            </div>
            <div className="teld-dashboard-reference__metric-copy">
              <span className="teld-dashboard-reference__metric-label">Cumulatif</span>
              <strong className="teld-dashboard-reference__metric-value"><small>GPB </small>{formatAmount(cumulative)}</strong>
            </div>
          </article>
        </section>

        {newsPosts.length > 0 && (
          <section className="teld-dashboard-reference__news" aria-label="Annonces">
            <div className="teld-dashboard-reference__news-heading">
              <h2>Annonces</h2>
              <button type="button" onClick={() => navigate("/news")} data-testid="button-home-news-see-all">
                Voir tout
              </button>
            </div>
            <div className="teld-dashboard-reference__news-list">
              {newsPosts.slice(0, 3).map((post) => (
                <button
                  type="button"
                  className="teld-dashboard-reference__news-card"
                  key={post.id}
                  onClick={() => navigate(`/news/${post.id}`)}
                  data-testid={`button-home-news-${post.id}`}
                >
                  {post.imageUrl ? (
                    <img
                      className="teld-dashboard-reference__news-image"
                      src={post.imageUrl}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="teld-dashboard-reference__news-placeholder" aria-hidden="true">T</span>
                  )}
                  <span className="teld-dashboard-reference__news-copy">
                    <span className="teld-dashboard-reference__news-title">
                      {post.title || "HSBC news"}
                    </span>
                    <span className="teld-dashboard-reference__news-date">
                      {formatNewsDate(post.createdAt)}
                    </span>
                    <span className="teld-dashboard-reference__news-excerpt">
                      {getNewsExcerpt(post.content)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      </main>
      <AboutModal open={isWelcomeOpen} onClose={() => setIsWelcomeOpen(false)} />
    </>
  );
}
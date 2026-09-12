export default function RefreshLoader() {
  return (
    <div className="refresh-loader-overlay" role="status" aria-label="Actualisation en cours">
      <style>{`
        .refresh-loader-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          pointer-events: all;
          background: transparent;
        }

        .refresh-loader-box {
          display: grid;
          width: 135px;
          height: 135px;
          place-items: center;
          border-radius: 10px;
          background: rgba(57, 57, 57, .91);
        }

        .refresh-loader-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, .28);
          border-top-color: #fff;
          border-right-color: #fff;
          border-radius: 50%;
          animation: refresh-loader-spin .82s linear infinite;
        }

        @keyframes refresh-loader-spin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .refresh-loader-spinner {
            animation-duration: 1.6s;
          }
        }
      `}</style>
      <div className="refresh-loader-box" aria-hidden="true">
        <span className="refresh-loader-spinner" />
      </div>
    </div>
  );
}
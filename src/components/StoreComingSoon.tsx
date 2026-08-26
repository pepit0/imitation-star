/** Coming-soon store badges using official Apple / Google assets. */
export default function StoreComingSoon() {
  return (
    <div className="store-coming-soon" aria-label="Mobile apps coming soon">
      <div className="store-coming-soon__badges">
        <div className="store-coming-soon__badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/stores/app-store-badge.svg"
            alt="Download on the App Store"
            className="store-coming-soon__img store-coming-soon__img--apple"
            width={140}
            height={47}
            draggable={false}
          />
          <span className="store-coming-soon__label">Coming soon</span>
        </div>
        <div className="store-coming-soon__badge">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/stores/google-play-badge.png"
            alt="Get it on Google Play"
            className="store-coming-soon__img store-coming-soon__img--google"
            width={168}
            height={65}
            draggable={false}
          />
          <span className="store-coming-soon__label">Coming soon</span>
        </div>
      </div>
    </div>
  );
}

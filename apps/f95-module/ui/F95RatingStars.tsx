import { Star, StarHalf } from 'lucide-react';

type F95RatingStarsProps = {
  rating: number;
};

export function F95RatingStars({ rating }: F95RatingStarsProps) {
  const roundedRating = Math.round(Math.max(0, Math.min(5, rating)) * 2) / 2;
  const fullStars = Math.floor(roundedRating);
  const hasHalfStar = roundedRating % 1 === 0.5;

  return (
    <span className="f95-module-rating-stars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => {
        if (index < fullStars) {
          return <Star key={index} size={16} className="f95-module-rating-stars__icon f95-module-rating-stars__icon--full" fill="currentColor" strokeWidth={1.8} />;
        }

        if (index === fullStars && hasHalfStar) {
          return <StarHalf key={index} size={16} className="f95-module-rating-stars__icon f95-module-rating-stars__icon--half" fill="currentColor" strokeWidth={1.8} />;
        }

        return <Star key={index} size={16} className="f95-module-rating-stars__icon f95-module-rating-stars__icon--empty" strokeWidth={1.8} />;
      })}
    </span>
  );
}
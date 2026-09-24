export default function RatingStars({ rating }) {
  if (rating === null || rating === undefined) return <span className="rating-stars muted">—</span>;
  const full = Math.round(rating);
  return (
    <span className="rating-stars" title={`${rating} / 5`}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  );
}

import { useSessionStore } from '../../store/sessionStore';

interface FavoriteButtonProps {
  sessionName: string;
  size?: number;
}

export function FavoriteButton({ sessionName, size = 14 }: FavoriteButtonProps) {
  const isFavorite = useSessionStore((s) => s.favorites.includes(sessionName));
  const toggleFavorite = useSessionStore((s) => s.toggleFavorite);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavorite(sessionName);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="hover:scale-110 transition-transform"
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFavorite ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-warning">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-default-300 hover:text-warning">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      )}
    </button>
  );
}

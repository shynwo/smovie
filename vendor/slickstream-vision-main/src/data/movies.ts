import movie1 from "@/assets/movie-1.jpg";
import movie2 from "@/assets/movie-2.jpg";
import movie3 from "@/assets/movie-3.jpg";
import movie4 from "@/assets/movie-4.jpg";
import movie5 from "@/assets/movie-5.jpg";
import movie6 from "@/assets/movie-6.jpg";
import movie7 from "@/assets/movie-7.jpg";
import movie8 from "@/assets/movie-8.jpg";

export interface Movie {
  image: string;
  title: string;
  match: string;
  duration: string;
  tags: string[];
}

const allMovies: Movie[] = [
  { image: movie1, title: "Le Dernier Samouraï", match: "97% Match", duration: "2h 34min", tags: ["Action", "Drame", "Historique"] },
  { image: movie2, title: "Abysses", match: "94% Match", duration: "1h 58min", tags: ["Aventure", "Mystère", "Sci-Fi"] },
  { image: movie3, title: "Orbite Zéro", match: "96% Match", duration: "2h 11min", tags: ["Sci-Fi", "Thriller", "Drame"] },
  { image: movie4, title: "Le Passage", match: "92% Match", duration: "1h 47min", tags: ["Fantasy", "Horreur", "Mystère"] },
  { image: movie5, title: "Horizons Perdus", match: "95% Match", duration: "2h 22min", tags: ["Aventure", "Drame", "Survie"] },
  { image: movie6, title: "Nuit Rouge", match: "98% Match", duration: "2h 05min", tags: ["Thriller", "Noir", "Crime"] },
  { image: movie7, title: "Altitude", match: "91% Match", duration: "1h 52min", tags: ["Aventure", "Drame", "Nature"] },
  { image: movie8, title: "Néon District", match: "93% Match", duration: "2h 18min", tags: ["Cyberpunk", "Action", "Sci-Fi"] },
];

export const trendingMovies = [allMovies[5], allMovies[0], allMovies[7], allMovies[2], allMovies[4], allMovies[3], allMovies[1], allMovies[6]];
export const newReleases = [allMovies[2], allMovies[4], allMovies[6], allMovies[1], allMovies[5], allMovies[0], allMovies[7], allMovies[3]];
export const topRated = [allMovies[7], allMovies[3], allMovies[0], allMovies[5], allMovies[2], allMovies[6], allMovies[4], allMovies[1]];
export const actionMovies = [allMovies[0], allMovies[7], allMovies[5], allMovies[2], allMovies[4], allMovies[1], allMovies[3], allMovies[6]];

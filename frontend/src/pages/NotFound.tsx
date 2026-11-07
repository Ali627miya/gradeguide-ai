import { Link } from "react-router-dom";
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-6xl font-extrabold text-accent">404</p>
      <p className="text-lg">This page doesn't exist.</p>
      <Link to="/" className="btn-primary">Back to GradeGuide</Link>
    </div>
  );
}

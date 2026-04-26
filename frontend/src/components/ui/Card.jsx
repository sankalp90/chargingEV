export default function Card({ className = "", children }) {
  return <div className={`rounded-3xl bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)] ${className}`}>{children}</div>;
}

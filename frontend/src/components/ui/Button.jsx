const variants = {
  primary: "bg-[#467ee5] text-white hover:bg-[#3f74d7]",
  secondary: "bg-[#f8fafc] text-slate-700 hover:bg-[#eef2f7]",
  ghost: "bg-transparent text-slate-600 hover:bg-[#f8fafc]",
  danger: "bg-red-500 text-white hover:bg-red-400",
};

export default function Button({
  // eslint-disable-next-line no-unused-vars
  as: Tag = "button",
  variant = "primary",
  className = "",
  disabled = false,
  children,
  ...props
}) {
  return (
    <Tag
      className={`inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </Tag>
  );
}

export const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export const formatReadableDate = (date) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(date));

export const getAvailabilityTone = (status) => {
  if (status === "Available") return "text-emerald-600 bg-emerald-50";
  if (status === "Busy") return "text-rose-600 bg-rose-50";
  return "text-amber-600 bg-amber-50";
};

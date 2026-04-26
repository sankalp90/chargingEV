export const validateSignupForm = (values) => {
  const errors = {};

  if (!values.name.trim()) errors.name = "Full name is required.";
  if (!values.email.trim()) errors.email = "Email is required.";
  else if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = "Enter a valid email address.";
  if (!values.phone.trim()) errors.phone = "Phone number is required.";
  if (!values.password) errors.password = "Password is required.";
  else if (values.password.length < 6) errors.password = "Password must be at least 6 characters.";
  if (values.confirmPassword !== values.password) errors.confirmPassword = "Passwords do not match.";

  return errors;
};

export const validateBookingForm = (values) => {
  const errors = {};
  if (!values.date) errors.date = "Choose a charging date.";
  if (!values.slot) errors.slot = "Select a charging slot.";
  if (!values.vehicleNumber.trim()) errors.vehicleNumber = "Vehicle number is required.";
  if (!values.energyNeeded || Number(values.energyNeeded) <= 0) errors.energyNeeded = "Enter required energy in kWh.";
  return errors;
};

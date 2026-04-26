const SocialButton = ({ icon, text, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-[10px] rounded-[30px] border border-[#d7dfeb] bg-white p-[10px] text-[#1e3a66] transition duration-300 hover:bg-[#f8fafc]"
    >
      {icon}
      {text}
    </button>
  );
};

export default SocialButton;

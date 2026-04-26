import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unexpected frontend error",
    };
  }

  componentDidCatch(error) {
    console.error("App render failure:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#212121] px-4 text-white">
          <div className="w-full max-w-2xl rounded-3xl border border-rose-500/20 bg-[#262626] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
            <p className="text-sm uppercase tracking-[0.3em] text-rose-300">Render Error</p>
            <h1 className="mt-3 text-3xl font-semibold">The app crashed during initial render.</h1>
            <p className="mt-4 text-gray-300">
              A safe fallback is showing instead of a blank screen so the exact issue is visible.
            </p>
            <pre className="mt-6 overflow-auto rounded-2xl border border-[#333] bg-[#1d1d1d] p-4 text-sm text-amber-200">
              {this.state.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

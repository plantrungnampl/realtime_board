import { useEffect, useRef, useState } from "react";

type UsePublicWorkspaceToastOptions = {
  boardId: string;
  isPublic: boolean;
};

export const usePublicWorkspaceToast = ({
  boardId,
  isPublic,
}: UsePublicWorkspaceToastOptions) => {
  const [publicToastVisible, setPublicToastVisible] = useState(false);
  const publicToastTimerRef = useRef<number | null>(null);
  const showPublicWorkspaceMessage = Boolean(isPublic);

  useEffect(() => {
    const toastKey = `board-public-toast:${boardId}`;
    if (!showPublicWorkspaceMessage) {
      if (publicToastTimerRef.current) {
        window.clearTimeout(publicToastTimerRef.current);
        publicToastTimerRef.current = null;
      }
      const hideTimer = window.setTimeout(() => {
        setPublicToastVisible(false);
      }, 0);
      return () => window.clearTimeout(hideTimer);
    }

    let alreadyShown = false;
    try {
      alreadyShown = window.localStorage.getItem(toastKey) === "1";
    } catch {
      alreadyShown = false;
    }

    if (alreadyShown) {
      const hideTimer = window.setTimeout(() => {
        setPublicToastVisible(false);
      }, 0);
      return () => window.clearTimeout(hideTimer);
    }

    const showTimer = window.setTimeout(() => {
      setPublicToastVisible(true);
    }, 0);
    if (publicToastTimerRef.current) {
      window.clearTimeout(publicToastTimerRef.current);
    }
    publicToastTimerRef.current = window.setTimeout(() => {
      setPublicToastVisible(false);
      publicToastTimerRef.current = null;
    }, 3500);
    try {
      window.localStorage.setItem(toastKey, "1");
    } catch {
      // Ignore storage failures in restricted contexts.
    }

    return () => {
      window.clearTimeout(showTimer);
      if (publicToastTimerRef.current) {
        window.clearTimeout(publicToastTimerRef.current);
        publicToastTimerRef.current = null;
      }
    };
  }, [boardId, showPublicWorkspaceMessage]);

  return {
    showPublicWorkspaceMessage,
    publicToastVisible,
  };
};

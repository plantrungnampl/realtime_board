import { useEffect, useMemo } from "react";

import { clientLogger, type Logger } from "./index";

type UseLoggerOptions = {
  logMount?: boolean;
};

export const useLogger = (
  component: string,
  context?: Record<string, unknown>,
  options?: UseLoggerOptions,
): Logger => {
  const baseContext = useMemo(
    () => ({
      component,
      ...(context ?? {}),
    }),
    [component, context],
  );

  const logger = useMemo(() => clientLogger.child(baseContext), [baseContext]);

  useEffect(() => {
    if (!options?.logMount) {
      return;
    }
    logger.debug("Component mounted");
    return () => {
      logger.debug("Component unmounted");
    };
  }, [logger, options?.logMount]);

  return logger;
};

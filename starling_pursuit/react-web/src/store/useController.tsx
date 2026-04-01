import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { AppController, controller as defaultController } from './controller';

const ControllerContext = createContext<AppController>(defaultController);

export function ControllerProvider({ children }: { children: ReactNode }) {
  return (
    <ControllerContext.Provider value={defaultController}>
      {children}
    </ControllerContext.Provider>
  );
}

export function useController(): AppController {
  const ctrl = useContext(ControllerContext);
  // Subscribe to changes so components re-render
  useSyncExternalStore(
    (cb) => ctrl.subscribe(cb),
    () => ctrl.getData(),
  );
  return ctrl;
}

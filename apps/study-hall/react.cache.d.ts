import "react";

declare module "react" {
  export function cache<T extends (...args: any[]) => any>(fn: T): T;
}

export {};

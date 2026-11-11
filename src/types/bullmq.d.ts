declare module 'bullmq' {
  export const Worker: any;
  export const Queue: any;
  export interface WorkerOptions {
    [key: string]: any;
  }
  export interface Job<T = any, R = any, N extends string = string> {
    id?: string;
    name: N;
    data: T;
    opts: any;
    progress: number | object;
    returnvalue: R;
    stacktrace: string[];
    attemptsMade: number;
    delay: number;
    timestamp: number;
    finishedOn?: number;
    processedOn?: number;
  }
}

export function withDeadline<T>(
  task: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(`${operation}_timeout`)), timeoutMs);
    void task.then(resolve, reject).finally(() => globalThis.clearTimeout(timer));
  });
}

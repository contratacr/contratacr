export class PromiseTimeoutError extends Error {
  constructor(message = "operation-timeout") {
    super(message);
    this.name = "PromiseTimeoutError";
  }
}

export function withPromiseTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new PromiseTimeoutError(message)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

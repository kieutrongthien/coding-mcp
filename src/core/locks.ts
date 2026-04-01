export class ProjectLockManager {
  private readonly queues = new Map<string, Promise<void>>();

  async withProjectLock<T>(projectId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(projectId) ?? Promise.resolve();
    let release: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.queues.set(projectId, previous.then(() => current));
    await previous;

    try {
      return await action();
    } finally {
      release!();
      if (this.queues.get(projectId) === current) {
        this.queues.delete(projectId);
      }
    }
  }
}

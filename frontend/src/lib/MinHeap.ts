export class MinHeap<T> {
  private content: { item: T; score: number }[] = [];

  push(item: T, score: number) {
    this.content.push({ item, score });
    this.bubbleUp(this.content.length - 1);
  }

  pop(): T | undefined {
    const result = this.content[0];
    const end = this.content.pop();
    if (this.content.length > 0 && end) {
      this.content[0] = end;
      this.bubbleDown(0);
    }
    return result?.item;
  }

  size(): number {
    return this.content.length;
  }

  private bubbleUp(n: number) {
    const element = this.content[n];
    let index = n;
    while (index > 0) {
      const parentN = Math.floor((index + 1) / 2) - 1;
      const parent = this.content[parentN];
      if (element.score >= parent.score) break;
      this.content[parentN] = element;
      this.content[index] = parent;
      index = parentN;
    }
  }

  private bubbleDown(n: number) {
    const length = this.content.length;
    const element = this.content[n];
    let index = n;

    while (true) {
      const child2N = (index + 1) * 2;
      const child1N = child2N - 1;
      let swap: number | null = null;

      const child1 = child1N < length ? this.content[child1N] : undefined;
      const child2 = child2N < length ? this.content[child2N] : undefined;

      if (child1 && child1.score < element.score) {
        swap = child1N;
      }

      if (child2 && child2.score < (swap === null ? element.score : child1!.score)) {
        swap = child2N;
      }

      if (swap === null) break;

      this.content[index] = this.content[swap];
      this.content[swap] = element;
      index = swap;
    }
  }
}

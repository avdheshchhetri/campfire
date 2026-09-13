// Bound in-flight documents while keeping results in original page order.
export async function analyzeBatches(chunks, analyze, controller, onComplete, concurrency = 3) {
  const pending = new Set();
  const results = [];
  let failure;
  let index = 0;
  try {
    for await (const chunk of chunks) {
      controller.signal.throwIfAborted();
      const position = index++;
      const task = Promise.resolve().then(() => analyze(chunk, controller.signal))
        .then(result => {
          controller.signal.throwIfAborted();
          results[position] = result;
          onComplete(chunk);
        }).catch(error => {
          if (!failure) failure = error;
          controller.abort();
        });
      pending.add(task);
      void task.finally(() => pending.delete(task));
      if (pending.size >= concurrency) await Promise.race(pending);
      if (failure) throw failure;
    }
    await Promise.all(pending);
    if (failure) throw failure;
    controller.signal.throwIfAborted();
    return results;
  } catch (error) {
    controller.abort();
    await Promise.allSettled(pending);
    throw failure || error;
  }
}

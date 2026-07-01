'use strict';

// Tiny zero-dep bounded-concurrency primitive (BLR Phase 3 / C-10).
// createLimit(n) returns a `limit` function: limit(fn) queues fn (a
// zero-arg function returning a Promise) and runs it as soon as fewer
// than `n` tasks are in flight, resolving/rejecting independently per
// call. Promise.all over multiple limit() calls still resolves in the
// caller's array order (standard Promise.all semantics) -- this module
// only bounds HOW MANY run at once, never the order they settle.
function createLimit(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('createLimit: concurrency must be a positive integer');
  }

  let activeCount = 0;
  const queue = [];

  function dequeueNext() {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift();
      run();
    }
  }

  function limit(fn) {
    return new Promise((resolve, reject) => {
      const run = () => {
        activeCount++;
        Promise.resolve()
          .then(fn)
          .then(
            (value) => { dequeueNext(); resolve(value); },
            (err) => { dequeueNext(); reject(err); }
          );
      };
      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  }

  return limit;
}

module.exports = { createLimit };

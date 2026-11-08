/**
 * `GET /v1/jobs/:id/events` (SSE): a nudge that something happened to a job.
 *
 * The page does not build its timeline from the frames. Each frame only says
 * "ask again": the job record (state, fee, transaction links) is read from
 * `GET /v1/jobs/:id`, which is the one place that has all of it. A stream that
 * drops is retried, as `subscribeToRun` does, because Firefox gives up on a
 * reset connection where Chrome keeps trying.
 */

import {API_URL, type StreamState} from './api';
import {JOB_EVENT_KINDS} from './market';

export function subscribeToJob(
  jobId: string,
  onEvent: (kind: string) => void,
  onConnection?: (state: StreamState) => void,
): () => void {
  const url = `${API_URL}/v1/jobs/${encodeURIComponent(jobId)}/events`;
  let source: EventSource;
  let stopped = false;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let lastId = '';

  const connect = () => {
    source = new EventSource(lastId ? `${url}?lastEventId=${encodeURIComponent(lastId)}` : url);
    for (const kind of JOB_EVENT_KINDS) {
      source.addEventListener(kind, (e) => {
        const id = (e as MessageEvent).lastEventId;
        if (id) lastId = id;
        onEvent(kind);
      });
    }
    source.onopen = () => {
      failures = 0;
      onConnection?.('open');
    };
    source.onerror = () => {
      if (stopped) return;
      failures += 1;
      onConnection?.(failures >= 3 ? 'lost' : 'reconnecting');
      if (source.readyState === EventSource.CLOSED) {
        retry = setTimeout(
          () => {
            if (!stopped) connect();
          },
          Math.min(3_000 * failures, 15_000),
        );
      }
    };
  };
  connect();

  return () => {
    stopped = true;
    clearTimeout(retry);
    source.close();
  };
}

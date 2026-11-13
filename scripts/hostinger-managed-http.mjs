// The managed runner checks both HTTP status and delivery. Consume unused bodies
// so pooled connections are released before the next request.
export async function responseStatus(pendingResponse) {
  const response = await pendingResponse;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (!(await reader.read()).done) {
        // The check uses only the status and does not retain response content.
      }
    } finally {
      reader.releaseLock();
    }
  }
  return response.status;
}

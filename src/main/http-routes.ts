export function isSseMessagePath(method: string | undefined, pathname: string): boolean {
  return method === "POST" && (pathname === "/sse" || pathname === "/messages");
}

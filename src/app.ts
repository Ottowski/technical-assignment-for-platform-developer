export type AppConfig = {
  port: number;
};

export function getAppConfig(): AppConfig {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: '${rawPort}'. Expected an integer between 1 and 65535.`);
  }

  return { port };
}

export function createAppInfo() {
  const { port } = getAppConfig();
  return {
    name: "absence-service",
    port,
  };
}

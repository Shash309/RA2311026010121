export async function Log(stack: string, level: string, pkg: string, message: string) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] [${stack}] [${pkg}]: ${message}`);
}

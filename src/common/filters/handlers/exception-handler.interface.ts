export interface ExceptionHandler {
    canHandle(exception: unknown): boolean;
    handle(exception: unknown): { status: number; message: string | string[]; errorCode?: string };
}
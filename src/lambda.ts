export interface LambdaHandlers {
  handler: (event: object, context: object, callback: (error?: Error | null) => void) => void;
}

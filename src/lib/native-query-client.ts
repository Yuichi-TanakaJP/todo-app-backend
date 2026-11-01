import type pg from "pg";

// pg-native returns raw text at pool scope; apply the actual query's public parser contract
// after native I/O, where conversion errors can reject the query instead of escaping a socket callback.
export function withPrismaParsers(NativeClient: typeof pg.Client) {
  return class extends NativeClient {
    constructor(...args: any[]) {
      super(args[0]);
      const parameters = (this as any).connectionParameters;
      // Native retains its authoritative DSN; keep it out of error.client debug inspection.
      Object.defineProperty(parameters, "nativeConnectionString", { enumerable: false });
    }
    override query(...args: any[]): any {
      const config = args[0];
      const types = typeof config === "object" ? config.types : undefined;
      const convert = (result: any): any => {
        if (Array.isArray(result)) return result.map(convert);
        if (!types || !result?.fields || !result?.rows) return result;
        result.rows = result.rows.map((row: any) => {
          const copy = Array.isArray(row) ? [...row] : { ...row };
          result.fields.forEach((field: any, index: number) => {
            const key = config.rowMode === "array" ? index : field.name;
            if (copy[key] !== null) copy[key] = types.getTypeParser(field.dataTypeID, "text")(copy[key]);
          });
          return copy;
        });
        return result;
      };
      let callbackIndex = -1;
      for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === "function") { callbackIndex = i; break; }
      }
      if (callbackIndex >= 0) {
        const callback = args[callbackIndex];
        args[callbackIndex] = (error: unknown, result: any) => {
          if (error) return callback(error);
          let converted;
          try { converted = convert(result); } catch (cause) { return callback(cause); }
          return callback(null, converted);
        };
        return super.query(args[0], args[1], args[2]);
      }
      return Promise.resolve(super.query(args[0], args[1])).then(convert);
    }
  };
}

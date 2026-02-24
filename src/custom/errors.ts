import axios from "axios";

export class HanzoKmsSDKError extends Error {
  constructor(message: string) {
    super(message);
    this.message = message;
    this.name = "HanzoKmsSDKError";
  }
}

export class HanzoKmsSDKRequestError extends Error {
  constructor(
    message: string,
    requestData: {
      url: string;
      method: string;
      statusCode: number;
    }
  ) {
    super(message);
    this.message = `[URL=${requestData.url}] [Method=${requestData.method}] [StatusCode=${requestData.statusCode}] ${message}`;
    this.name = "HanzoKmsSDKRequestError";
  }
}

export const newKmsError = (error: any) => {
  if (axios.isAxiosError(error)) {
    const data = error?.response?.data;

    if (data?.message) {
      let message = data.message;
      if (error.response?.status === 422) {
        message = JSON.stringify(data);
      }

      return new HanzoKmsSDKRequestError(message, {
        url: error.response?.config.url || "",
        method: error.response?.config.method || "",
        statusCode: error.response?.status || 0,
      });
    } else if (error.message) {
      return new HanzoKmsSDKError(error.message);
    } else if (error.code) {
      // If theres no message but a code is present, it's likely to be an aggregation error. This is not specific to Axios, but it falls under the AxiosError type
      return new HanzoKmsSDKError(error.code);
    } else {
      return new HanzoKmsSDKError("Request failed with unknown error");
    }
  }

  return new HanzoKmsSDKError(error?.message || "An error occurred");
};

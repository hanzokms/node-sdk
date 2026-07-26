import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

export interface HttpClientConfig {
	baseURL: string;
	timeout?: number;
}

/**
 * HttpClient is the one transport in this SDK: an axios instance pinned to a
 * KMS base URL, carrying the IAM bearer on every authenticated call and
 * retrying rate limits and network errors with jittered exponential backoff.
 *
 * It knows nothing about routes — every URL is built by the caller.
 */
export class HttpClient {
	private client: AxiosInstance;

	constructor(config: HttpClientConfig) {
		this.client = axios.create({
			baseURL: config.baseURL,
			timeout: config.timeout || 10000
		});

		this.setupRetryInterceptor();
	}

	private setupRetryInterceptor() {
		const maxRetries = 4;
		const initialRetryDelay = 1000;
		const backoffFactor = 2;

		this.client.interceptors.response.use(null, (error) => {
			const config = error?.config;
			if (!config) return Promise.reject(error);

			if (!config._retryCount) config._retryCount = 0;

			// handle rate limits and network errors
			if ((error.response?.status === 429 || error.response?.status === undefined) && config._retryCount < maxRetries) {
				config._retryCount++;
				const baseDelay = initialRetryDelay * Math.pow(backoffFactor, config._retryCount - 1);
				const jitter = baseDelay * 0.2;
				const exponentialDelay = baseDelay + (Math.random() * 2 - 1) * jitter;

				return new Promise((resolve) => {
					setTimeout(() => resolve(this.client(config)), exponentialDelay);
				});
			}

			return Promise.reject(error);
		});
	}

	public setAccessToken(token: string) {
		this.client.defaults.headers.common["Authorization"] = `Bearer ${token}`;
	}

	public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
		const response: AxiosResponse<T> = await this.client.get(url, config);
		return response.data;
	}

	public async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
		const response: AxiosResponse<T> = await this.client.post(url, data, config);
		return response.data;
	}

	public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
		const response: AxiosResponse<T> = await this.client.delete(url, config);
		return response.data;
	}
}

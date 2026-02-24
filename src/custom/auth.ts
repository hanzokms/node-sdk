import { HanzoKmsSDK } from "..";
import { AuthApi } from "../api/endpoints/auth";
import { UniversalAuthLoginRequest } from "../api/types";
import { MACHINE_IDENTITY_ID_ENV_NAME } from "./constants";
import { HanzoKmsSDKError, newKmsError } from "./errors";
import { getAwsRegion, performAwsIamLogin } from "./util";

type AuthenticatorFunction = (accessToken: string) => HanzoKmsSDK;

type AwsAuthLoginOptions = {
  identityId?: string;
};

export const renewToken = async (apiClient: AuthApi, token?: string) => {
  try {
    if (!token) {
      throw new HanzoKmsSDKError(
        "Unable to renew access token, no access token set."
      );
    }

    const res = await apiClient.renewToken({ accessToken: token });
    return res;
  } catch (err) {
    throw newKmsError(err);
  }
};

export default class AuthClient {
  constructor(
    private sdkAuthenticator: AuthenticatorFunction,
    private apiClient: AuthApi,
    private _accessToken?: string
  ) {}

  awsIamAuth = {
    login: async (options?: AwsAuthLoginOptions) => {
      try {
        const identityId =
          options?.identityId || process.env[MACHINE_IDENTITY_ID_ENV_NAME];
        if (!identityId) {
          throw new HanzoKmsSDKError(
            "Identity ID is required for AWS IAM authentication"
          );
        }

        const iamRequest = await performAwsIamLogin(await getAwsRegion());
        const res = await this.apiClient.awsIamAuthLogin({
          iamHttpRequestMethod: iamRequest.iamHttpRequestMethod,
          iamRequestBody: Buffer.from(iamRequest.iamRequestBody).toString(
            "base64"
          ),
          iamRequestHeaders: Buffer.from(
            JSON.stringify(iamRequest.iamRequestHeaders)
          ).toString("base64"),
          identityId,
        });

        return this.sdkAuthenticator(res.accessToken);
      } catch (err) {
        throw newKmsError(err);
      }
    },
    renew: async () => {
      try {
        const refreshedToken = await renewToken(
          this.apiClient,
          this._accessToken
        );
        return this.sdkAuthenticator(refreshedToken.accessToken);
      } catch (err) {
        throw newKmsError(err);
      }
    },
  };

  universalAuth = {
    login: async (options: UniversalAuthLoginRequest) => {
      try {
        const res = await this.apiClient.universalAuthLogin(options);
        return this.sdkAuthenticator(res.accessToken);
      } catch (err) {
        throw newKmsError(err);
      }
    },
    renew: async () => {
      try {
        const refreshedToken = await renewToken(
          this.apiClient,
          this._accessToken
        );
        return this.sdkAuthenticator(refreshedToken.accessToken);
      } catch (err) {
        throw newKmsError(err);
      }
    },
  };

  /**
  * Gets the current access token that is set on the SDK instance
  * @returns The current access token or null if no access token is set. `null` is returned if the SDK is not authenticated.
  */
  getAccessToken = () => this._accessToken || null;

  accessToken = (token: string) => {
    return this.sdkAuthenticator(token);
  };
}

/**
 * Contrat commun des réseaux sociaux (rapport 2.6.2) : un nouveau réseau
 * s'ajoute en écrivant un connecteur, sans toucher au reste de l'application.
 */

export type PublishRequest = {
  externalId: string;
  accessToken: string;
  caption: string;
  /** URL signées, joignables par le réseau au moment de l'envoi. */
  imageUrls: string[];
};

export type PublishResult = { externalPostId: string; url: string | null };

export interface SocialConnector {
  readonly network: string;
  publish(request: PublishRequest): Promise<PublishResult>;
  /** Dernières publications du compte, pour préremplir l'ADN de marque. */
  recentPosts(externalId: string, accessToken: string, limit: number): Promise<string[]>;
}

export type ConnectCandidate = {
  key: string;
  network: string;
  externalId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

export class SocialApiError extends Error {
  constructor(
    message: string,
    /** Vrai quand le jeton n'est plus valable : le compte doit être reconnecté. */
    public readonly tokenInvalid = false,
  ) {
    super(message);
    this.name = "SocialApiError";
  }
}

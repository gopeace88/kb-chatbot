// 카카오 오픈빌더 스킬 요청/응답 타입

/** 카카오 스킬 요청 */
export interface KakaoSkillRequest {
  version: "2.0";
  intent: {
    id: string;
    name: string;
  };
  userRequest: {
    timezone: string;
    utterance: string;
    lang: string;
    user: {
      id: string;
      type: string;
      properties: {
        appUserId?: string;
        plusfriendUserKey?: string;
      };
    };
  };
  bot: {
    id: string;
    name: string;
  };
  action?: {
    id: string;
    name: string;
    params: Record<string, string>;
    detailParams: Record<
      string,
      {
        origin: string;
        value: string;
        groupName?: string;
      }
    >;
    clientExtra?: Record<string, unknown>;
  };
}

/** 카카오 스킬 응답 */
export interface KakaoSkillResponse {
  version: "2.0";
  template: {
    outputs: KakaoOutput[];
    quickReplies?: KakaoQuickReply[];
  };
}

export type KakaoOutput =
  | { simpleText: { text: string } }
  | { simpleImage: { imageUrl: string; altText: string } }
  | { basicCard: KakaoBasicCard };

export interface KakaoBasicCard {
  title?: string;
  description?: string;
  thumbnail?: {
    imageUrl: string;
  };
  buttons?: KakaoButton[];
}

export interface KakaoButton {
  action: "webLink" | "message" | "phone" | "block";
  label: string;
  webLinkUrl?: string;
  messageText?: string;
  phoneNumber?: string;
  blockId?: string;
}

export interface KakaoQuickReply {
  action: "message" | "block";
  label: string;
  messageText?: string;
  blockId?: string;
}

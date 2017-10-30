import * as fs from 'fs';
import * as stream from 'stream';
import * as long from 'long';
import * as request from 'request-promise-native';
import * as objects from './draco/objects';
import * as constants from './draco/constants';
import Serializer from './draco/serializer';
import Deserializer from './draco/deserializer';

export class User {
    id: string;
    deviceId: string;
    nickname: string;
    avatar: number;
}

export default class DracoNode {
    request: any;
    cookies: any;
    clientInfo: objects.FClientInfo;
    user: User;
    dcportal: string;
    constructor(options) {
        this.cookies = request.jar();
        this.request = request.defaults({
            proxy: options.proxy,
            headers: {
                'User-Agent': 'DraconiusGO/6935 CFNetwork/811.5.4 Darwin/16.7.0',
                'Accept': '*/*',
                'Accept-Language': 'en-us',
                'Protocol-Version': '2373924766',
                'X-Unity-Version': '2017.1.0f3',
                'Client-Version': '6935',
            },
            encoding: null,
            gzip: true,
            jar: this.cookies,
            simple: false,
            resolveWithFullResponse: true,
        });
        this.cookies.setCookie(request.cookie('path=/'), 'https://us.draconiusgo.com');
        this.cookies.setCookie(request.cookie('Path=/'), 'https://us.draconiusgo.com');
        this.cookies.setCookie(request.cookie('domain=.draconiusgo.com'), 'https://us.draconiusgo.com');

        this.clientInfo = new objects.FClientInfo({
            platform: 'IPhonePlayer',
            platformVersion: 'iOS 10.3.3',
            deviceModel: 'iPhone8,1',
            revision: '6935',
            screenWidth: 750,
            screenHeight: 1334,
            language: 'English',
            iOsAdvertisingTrackingEnabled: false,
        });
        this.user = new User();
    }

    async ping() {
        try {
            const response = await this.request.post({
                url: 'https://us.draconiusgo.com/ping',
                headers: {
                    'Content-Type': 'application /x-www-form-urlencoded',
                },
                simple: true,
            });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async call(service: string, method: string, body: any) {
        const serializer = new Serializer();
        const buffer = serializer.serialize(body);
        const formData = {
            'service': service,
            'method': method,
            'args': {
                value: buffer,
                options: {
                    filename: 'args.dat',
                    contentType: 'application/octet-stream',
                },
            },
        };

        const response = await this.request.post({
            url: 'https://us.draconiusgo.com/serviceCall',
            formData,
            headers: {
                dcportal: this.dcportal,
            },
        });

        if (response.headers['dcportal']) this.dcportal = response.headers['dcportal'];

        const deserializer = new Deserializer(response.body);
        const data = deserializer.deserialize();
        return data;
    }

    async event(name, one?, two?, three?) {
        await this.call('ClientEventService', 'onEvent', [
            name,
            this.user.id,
            this.clientInfo,
            one,
            two,
            three,
            null,
            null
        ]);
    }

    async boot(clientinfo) {
        this.user.id = clientinfo.userId;
        this.user.deviceId = clientinfo.deviceId;
        this.clientInfo.iOsVendorIdentifier = clientinfo.deviceId;
        for (const key in clientinfo) {
            if (this.clientInfo.hasOwnProperty(key)) {
                this.clientInfo[key] = clientinfo[key];
            }
        }
        await this.event('LoadingScreenPercent', '100');
        await this.event('Initialized');
    }

    async login() {
        await this.event('TrySingIn', 'DEVICE');
        const response = await this.call('AuthService', 'trySingIn', [
            new objects.AuthData({
                authType: constants.AuthType.DEVICE,
                profileId: this.user.deviceId,
            }),
            this.clientInfo,
            new objects.FRegistrationInfo({
                regType: 'dv',
            }),
        ]);
        if (response && response.info) {
            this.user.id = response.info.userId;
            this.user.avatar = response.info.avatarAppearanceDetails;
        }
        return response;
    }

    async load() {
        await this.event('LoadingScreenPercent', '100');
        await this.event('CreateAvatarByType', 'MageMale');
        await this.event('LoadingScreenPercent', '100');
        await this.event('AvatarUpdateView', this.user.avatar.toString());
        await this.event('InitPushNotifications', 'True');
    }

    async validateNickname(nickname) {
        await this.event('ValidateNickname', nickname);
        return await this.call('AuthService', 'validateNickname', [ nickname ]);
    }

    async acceptTos() {
        await this.event('LicenceShown');
        await this.event('LicenceAccepted');
    }

    async register(nickname) {
        this.user.nickname = nickname;
        this.event('Register', 'DEVICE', nickname);
        const response = await this.call('AuthService', 'register', [
            new objects.AuthData({
                authType: constants.AuthType.DEVICE,
                profileId: this.user.deviceId
            }),
            nickname,
            this.clientInfo,
            new objects.FRegistrationInfo({ regType: 'dv' }),
        ]);

        this.user.id = response.info.userId;
        await this.event('ServerAuthSuccess', this.user.id);

        return response;
    }

    async setAvatar(avatar) {
        this.user.avatar = +avatar;
        await this.event('AvatarPlayerGenderRace', '1', '1');
        await this.event('AvatarPlayerSubmit', avatar.toString());
        return await this.call('PlayerService', 'saveUserSettings', [ +avatar ]);
    }

    async getUserItems() {
        return this.call('ItemService', 'getUserItems', null);
    }

    async getCreadex() {
        return this.call('UserCreatureService', 'getCreadex', []);
    }

    async getUserCreatures() {
        return this.call('UserCreatureService', 'getUserCreatures', []);
    }

    async getMapUpdate(latitude: number, longitude: number, horizontalAccuracy = 20) {
        return this.call('MapService', 'getUpdate', [
            new objects.FUpdateRequest({
                clientRequest: new objects.FClientRequest({
                    time: 0,
                    currentUtcOffsetSeconds: 7200,
                    coords: new objects.GeoCoords({
                        latitude,
                        longitude,
                        horizontalAccuracy,
                    }),
                }),
                clientPlatform: constants.ClientPlatform.IOS,
                tilesCache: new Map<objects.FTile, long>(),
            }),
        ]);
    }
}

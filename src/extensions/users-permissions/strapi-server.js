const _ = require("lodash");
const urlJoin = require("url-join");
const axios = require("axios");

const { getAbsoluteServerUrl } = require("@strapi/utils");
const { getService } = require("../utils");

module.exports = module.exports = (plugin) => {
  plugin.services.providers = ({ strapi }) => {
    console.log("start rock");
    const getProfile = async (provider, query) => {
      const accessToken = query.access_token || query.code || query.oauth_token;

      const providers = await strapi
        .store({ type: "plugin", name: "users-permissions", key: "grant" })
        .get();

      return getService("providers-registry").run({
        provider,
        query,
        accessToken,
        providers,
      });
    };

    const connect = async (provider, query) => {
      const accessToken = query.access_token || query.code || query.oauth_token;

      if (!accessToken) {
        throw new Error("No access_token.");
      }

      // Get the profile.
      const profile = await getProfile(provider, query);

      let data = null;
      try {
        const googleData = await axios({
          url: "https://www.googleapis.com/oauth2/v2/userinfo",
          method: "get",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        data = googleData.data;
      } catch (e) {
        console.log(e);
      }

      const email = _.toLower(profile.email);

      // We need at least the mail.
      if (!email) {
        throw new Error("Email was not available.");
      }

      const users = await strapi
        .query("plugin::users-permissions.user")
        .findMany({
          where: { email },
        });

      const advancedSettings = await strapi
        .store({ type: "plugin", name: "users-permissions", key: "advanced" })
        .get();

      const user = _.find(users, { provider });

      if (_.isEmpty(user) && !advancedSettings.allow_register) {
        throw new Error("Register action is actually not available.");
      }

      if (!_.isEmpty(user)) {
        return user;
      }

      if (users.length && advancedSettings.unique_email) {
        throw new Error("Email is already taken.");
      }

      const defaultRole = await strapi
        .query("plugin::users-permissions.role")
        .findOne({ where: { type: advancedSettings.default_role } });

      const validateUsername = (username) => {
        if (username.length >= 6) return username;

        return `${username}${Math.random()
          .toString()
          .slice(2, 8 - username.length + 2)}`;
      };

      const newUser = {
        ...profile,
        email,
        provider,
        role: defaultRole.id,
        confirmed: true,
        picture: data?.picture || null,
        usernameLong: validateUsername(profile.username),
      };

      const createdUser = await strapi
        .query("plugin::users-permissions.user")
        .create({ data: newUser });

      return createdUser;
    };

    const buildRedirectUri = (provider = "") => {
      const apiPrefix = strapi.config.get("api.rest.prefix");
      return urlJoin(
        getAbsoluteServerUrl(strapi.config),
        apiPrefix,
        "connect",
        provider,
        "callback"
      );
    };

    return {
      connect,
      buildRedirectUri,
    };
  };

  return plugin;
};

const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const { proxySub2APIRequest } = require('./server/sub2api-web-proxy');

const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

const previousEnhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, metroServer) => {
    const enhancedMiddleware = previousEnhanceMiddleware
      ? previousEnhanceMiddleware(middleware, metroServer)
      : middleware;
    return (request, response, next) => {
      if (request.url?.startsWith('/__sub2api_proxy__')) {
        void proxySub2APIRequest(request, response);
        return;
      }
      return enhancedMiddleware(request, response, next);
    };
  },
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});

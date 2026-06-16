// oh-my-nusantara: fork of oh-my-openagent (https://github.com/code-yeongyu/oh-my-openagent)
// by Yeongyu Kim. Rebrands agent identities with Indonesian historical figures
// while maintaining full backward compatibility with upstream config schema.
export const PLUGIN_NAME = "oh-my-nusantara"
export const LEGACY_PLUGIN_NAME = "oh-my-openagent"
export const OLDER_LEGACY_PLUGIN_NAME = "oh-my-opencode"
export const PUBLISHED_PACKAGE_NAME = OLDER_LEGACY_PLUGIN_NAME
export const ACCEPTED_PACKAGE_NAMES = [PUBLISHED_PACKAGE_NAME, LEGACY_PLUGIN_NAME, PLUGIN_NAME] as const
export const CONFIG_BASENAME = "oh-my-nusantara"
export const LEGACY_CONFIG_BASENAME = "oh-my-openagent"
export const OLDER_LEGACY_CONFIG_BASENAME = "oh-my-opencode"
export const LOG_FILENAME = "oh-my-opencode.log"
export const CACHE_DIR_NAME = "oh-my-opencode"
/** All config basenames the loader should detect (canonical + legacy). */
export const ALL_CONFIG_BASENAMES = [CONFIG_BASENAME, LEGACY_CONFIG_BASENAME, OLDER_LEGACY_CONFIG_BASENAME] as const
/** Legacy basenames only (for migration detection). */
export const LEGACY_CONFIG_BASENAMES = [LEGACY_CONFIG_BASENAME, OLDER_LEGACY_CONFIG_BASENAME] as const

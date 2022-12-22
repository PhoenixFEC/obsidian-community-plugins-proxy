import {
    App,
    Notice,
    Plugin,
    PluginManifest,
    PluginSettingTab,
    Setting,
} from "obsidian";

interface GProxySettings {
    pluginName?: string;
    mirrorServer: string;
    enabled: boolean;
    language?: string;
}

const DEFAULT_SETTINGS: GProxySettings = {
    mirrorServer: "fastgit",
    enabled: false,
    language: 'ZH-CN'
};

const mirrorsMap: any = {
    fastgit: {
        download: "https://download.fastgit.org/",
        raw: "https://raw.fastgit.org/",
        repo: "https://hub.fastgit.org/",
    },
    mtr: {
        download: "https://download.fastgit.org/",
        raw: "https://raw-gh.gcdn.mirr.one/",
        repo: "https://api.mtr.pub/",
    },
    ghproxy: {
        download: "https://mirror.ghproxy.com/https://github.com/",
        raw: "https://mirror.ghproxy.com/https://github.com/",
        repo: "https://mirror.ghproxy.com/https://github.com/",
    },
    gitclone: {
        download: "https://download.fastgit.org/",
        raw: "https://raw.fastgit.org/",
        repo: "https://gitclone.com/github.com/",
    },
    mirr: {
        download: "https://gh.gcdn.mirr.one/",
        raw: "https://raw-gh.gcdn.mirr.one/",
        repo: "https://gh.gcdn.mirr.one/",
    },
};

export default class GithubProxy extends Plugin {
    settings: GProxySettings;
    proxyElectron: ProxyElectron;
    pluginName: string;
    version: string;

    constructor(app: App, plugin: PluginManifest) {
        super(app, plugin);
        this.pluginName = plugin.name;
        this.version = plugin.version;
    }

    async onload() {
        await this.loadSettings();

        // Creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon(
            "cherry",
            "社区插件代理开关",
            // TODO: this.settings.enabled ? "Disable GProxy" : "Enable GProxy",
            async (evt: MouseEvent) => {
                this.switchGProxy();
            }
        );

        // TODO: current status style
        ribbonIconEl.addClass(
            this.settings.enabled
                ? "enabled-gproxy-ribbon"
                : "disabled-gproxy-ribbon"
        );

        this.addCommand({
            id: "GProxy",
            name: "打开/关闭社区插件代理",
            callback: () => {
                this.switchGProxy();
            },
        });

        // Add settings tab
        this.addSettingTab(new GProxySettingTab(this.app, this));

        // Proxy here
        const self = this;
        if (window.electron) {
            this.proxyElectron = new ProxyElectron(
                self.pluginName,
                self.settings.mirrorServer
            );
            this.proxyElectron.registerRequest();
        }
    }

    onunload() {
        if (window.electron) {
            this.proxyElectron.cancelRegister();
        }
    }

    switchGProxy() {
        // Setting 'Enable GProxy' or 'Disable GProxy' when the user clicks the icon.
        this.loadSettings({ enabled: !this.settings.enabled });
        this.saveSettings();

        new Notice(
            this.settings.enabled ? "已关闭社区插件代理" : "已启用社区插件代理"
        );
    }

    async loadSettings(option?: object) {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
            option || {}
        );

        // console.log("Current Settings--->>>", this.settings);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// proxy Electron client request
class ProxyElectron {
    pluginName: string;
    mirrorServer: string;
    request: any;

    constructor(pluginName: string, mirrorServer: string) {
        // super(plugin);
        this.pluginName = pluginName;
        this.mirrorServer = mirrorServer;
    }

    registerRequest() {
        this.request = window.electron.ipcRenderer.send;
        const self = this;
        window.electron.ipcRenderer.send = function (
            channel: string,
            salt: string,
            opt: any,
            ...rest: any[]
        ) {
            // console.log("before---->>>", channel, salt, opt, ...rest);
            if (channel === "request-url") {
                const additionalOpt = resolveUrl(opt.url, self.mirrorServer);
                opt = Object.assign({}, opt, additionalOpt);
            }
            // console.log("after---->>>", channel, salt, opt, ...rest);
            self.request(channel, salt, opt, ...rest);
        };
        console.log(
            `[${this.pluginName}] electron.ipcRenderer.send has been taken over`
            // `[${this.pluginName}] electron.ipcRenderer.send 已被接管`
        );
    }

    cancelRegister() {
        window.electron.ipcRenderer.send = this.request;
    }
}

// Resolve current `Request URL` to proxy url
function resolveUrl(url: string, mirrorServer = DEFAULT_SETTINGS.mirrorServer) {
    if (!url || !RegExp("^https?").test(url)) return { url: url };

    // resolve download/raw/repo url
    const isDownload = RegExp("/releases/download/").test(url);
    const isRaw = RegExp("https://raw.githubusercontent.com/").test(url);
    let newUrl;

    if (isDownload) {
        newUrl = url.replace(
            "https://github.com/",
            mirrorsMap[mirrorServer]["download"]
        );
    } else {
        newUrl = url.replace(
            "https://github.com/",
            mirrorsMap[mirrorServer]["repo"]
        );
    }

    if (isRaw) {
        newUrl = url.replace(
            "https://raw.githubusercontent.com/",
            mirrorsMap[mirrorServer]["raw"]
        );
    }

    return {
        url: newUrl,
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "Access-Control-Allow-Origin": "*",
        },
    };
}

class GProxySettingTab extends PluginSettingTab {
    plugin: GithubProxy;

    constructor(app: App, plugin: GithubProxy) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h1", { text: "GProxy" });
        containerEl.createEl("p", { text: "从github镜像资源站下载Obsidian 社区插件，解决github资源下载失败问题" });

        new Setting(containerEl)
            .setName("启用 GProxy")
            .setDesc("是否启用 GProxy，选择镜像代理 Obsidian 社区插件")
            .addToggle((proxySwitch) =>
                proxySwitch
                    .setValue(this.plugin.settings.enabled)
                    .onChange(async (value) => {
                        this.plugin.settings.enabled = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl).setName("选择镜像源").addDropdown((option) => {
            option
                .addOption("fastgit", "fastgit")
                .addOption("mtr", "mtr")
                .addOption("ghproxy", "ghproxy")
                .addOption("gitclone", "gitclone")
                .addOption("mirr", "mirr")
                .setValue(this.plugin.settings.mirrorServer)
                .onChange(async (val) => {
                    this.plugin.settings.mirrorServer = val;
                    await this.plugin.saveSettings();
                });
        });

        new Setting(containerEl)
            .setName("Language")
            .setDesc("Choose your favor language.")
            .addDropdown((option) => {
                option
                    .setDisabled(true)
                    .addOption("ZH-CN", "简体中文")
                    .addOption("EN", "English")
                    .setValue(this.plugin.settings.language)
                    .onChange(async (val) => {
                        console.log("Language", val);
                        this.plugin.settings.language = val;
                        await this.plugin.saveSettings();
                    });
            });
    }
}

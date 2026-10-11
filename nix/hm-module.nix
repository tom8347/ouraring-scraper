# Home Manager module: the `oura` command, a timer that keeps the data (and
# the bar summary, glance.json) fresh, and a dashboard that systemd starts on
# the first visit to http://127.0.0.1:<port>/ and that exits again when idle.
#
# Secrets are never part of the configuration: `oura login` writes them to
# ~/.config/oura (mode 600) once per machine.
self:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.oura;
  oura = lib.getExe cfg.package;
  environment = [ "OURA_DATA_DIR=${cfg.dataDir}" ];
in
{
  options.services.oura = {
    enable = lib.mkEnableOption "Oura Ring data sync and dashboard";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "ouraring-scraper.packages.\${system}.default";
      description = "The oura package.";
    };

    dataDir = lib.mkOption {
      type = lib.types.str;
      default = "${config.xdg.dataHome}/oura";
      defaultText = lib.literalExpression ''"''${config.xdg.dataHome}/oura"'';
      description = "Where the CSV files go. Safe to share: it holds no credentials.";
    };

    syncInterval = lib.mkOption {
      type = lib.types.str;
      default = "*:0/30";
      description = "When to sync, as a systemd OnCalendar expression (missed runs catch up after sleep).";
    };

    dashboard = {
      port = lib.mkOption {
        type = lib.types.port;
        default = 8787;
        description = "Port for the dashboard on 127.0.0.1.";
      };
      idleExit = lib.mkOption {
        type = lib.types.ints.unsigned;
        default = 30;
        description = "Stop the dashboard server after this many idle minutes (0: never). The next visit starts it again.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
    # So `oura` in a terminal uses the same data as the services
    home.sessionVariables.OURA_DATA_DIR = cfg.dataDir;

    systemd.user.services.oura-sync = {
      Unit.Description = "Fetch new Oura Ring data";
      Service = {
        Type = "oneshot";
        ExecStart = "${oura} sync";
        Environment = environment;
      };
    };

    systemd.user.timers.oura-sync = {
      Unit.Description = "Fetch new Oura Ring data periodically";
      Timer = {
        OnStartupSec = "1min";
        OnCalendar = cfg.syncInterval;
        Persistent = true;
        RandomizedDelaySec = "1min";
      };
      Install.WantedBy = [ "timers.target" ];
    };

    systemd.user.sockets.oura-dashboard = {
      Unit.Description = "Oura dashboard (started on first visit)";
      Socket.ListenStream = "127.0.0.1:${toString cfg.dashboard.port}";
      Install.WantedBy = [ "sockets.target" ];
    };

    systemd.user.services.oura-dashboard = {
      Unit.Description = "Oura dashboard server";
      Service = {
        ExecStart = "${oura} serve --port ${toString cfg.dashboard.port} --idle-exit ${toString cfg.dashboard.idleExit}";
        Environment = environment;
      };
    };
  };
}

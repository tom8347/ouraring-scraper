{
  description = "Oura Ring data scraper and dashboard";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
  let
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
  in
  {
    packages = forAllSystems (pkgs: {
      default = pkgs.callPackage ./nix/package.nix { };
    });

    # services.oura: sync timer + socket-activated dashboard (see nix/hm-module.nix)
    homeManagerModules.default = import ./nix/hm-module.nix self;

    devShells = forAllSystems (pkgs:
    let
      isLinux = pkgs.stdenv.isLinux;
      py = pkgs.python3.withPackages (ps: with ps; [
        pynvim
        python-lsp-server
        pylsp-mypy
        pylsp-rope
        ipython
        # project
        requests
        setuptools
        # analysis/ scripts
        numpy
        matplotlib
        pyqt6
      ]);
      # `oura` runs the working tree, not the packaged copy
      oura-dev = pkgs.writeShellScriptBin "oura" ''exec python -m oura "$@"'';
    in
    {
      default = pkgs.mkShell {
        packages = [ py oura-dev ] ++ pkgs.lib.optionals isLinux [ pkgs.qt6.qtwayland ];

        shellHook = ''
          export PYTHONPATH="$PWD''${PYTHONPATH:+:$PYTHONPATH}"
          echo "Oura scraper environment"
          echo "Python: $(python --version)"
          echo "Run: oura dashboard   (oura --help for more)"
          ${pkgs.lib.optionalString isLinux ''
            export QT_QPA_PLATFORM=wayland
          ''}
          export MPLBACKEND=QtAgg
        '';
      };
    });
  };
}

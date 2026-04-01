{
  description = "Oura Ring data scraper";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
  let
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
  in
  {
    devShells = forAllSystems (system:
    let
      pkgs = import nixpkgs { inherit system; };
      isLinux = pkgs.stdenv.isLinux;
      py = pkgs.python3.withPackages (ps: with ps; [
        requests
        numpy
        pandas
        matplotlib
        pyqt6
      ]);
      linuxPkgs = pkgs.lib.optionals isLinux [ pkgs.qt6.qtwayland ];
    in
    {
      default = pkgs.mkShell {
        packages = [ py ] ++ linuxPkgs;

        shellHook = ''
          echo "Oura scraper environment"
          echo "Python: $(python --version)"
          ${pkgs.lib.optionalString isLinux ''
            export QT_QPA_PLATFORM=wayland
          ''}
          export MPLBACKEND=QtAgg
        '';
      };
    });
  };
}

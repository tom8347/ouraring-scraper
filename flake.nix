{
  description = "Oura Ring data scraper";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
    py = pkgs.python3.withPackages (ps: with ps; [
      requests
      numpy
      matplotlib
      pynvim
      python-lsp-server
      pyqt6
    ]);
  in
  {
    devShells.${system}.default = pkgs.mkShell {
      packages = [ py pkgs.qt6.qtwayland ];

      shellHook = ''
        echo "Oura scraper environment"
        echo "Python: $(python --version)"
        export QT_QPA_PLATFORM=wayland
        export MPLBACKEND=QtAgg
      '';
    };
  };
}

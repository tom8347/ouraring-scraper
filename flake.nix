{
  description = "Oura Ring data scraper";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
    py = pkgs.python3.withPackages (ps: with ps; [
      requests
      pynvim
      python-lsp-server
    ]);
  in
  {
    devShells.${system}.default = pkgs.mkShell {
      packages = [ py ];

      shellHook = ''
        echo "Oura scraper environment"
        echo "Python: $(python --version)"
        echo "requests: $(python -c 'import requests; print(requests.__version__)')"
      '';
    };
  };
}

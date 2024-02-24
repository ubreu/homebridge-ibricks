{
  description = "Tooling for Homebridge iBricks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    devenv.url = "github:cachix/devenv";
  };

  outputs = inputs @ {
    self,
    flake-parts,
    ...
  }:
    flake-parts.lib.mkFlake {inherit inputs;} {
      #flake = { }; # system-agnostic flake attributes
      systems = ["x86_64-linux" "x86_64-darwin" "aarch64-darwin" "aarch64-linux"];
      imports = [inputs.devenv.flakeModule];
      # Documentation of arguments: https://flake.parts/module-arguments.html
      perSystem = {pkgs, ...}: {
        # define development shells
        devenv.shells.default = {config, ...}: {
          languages.javascript = {
            enable = true;
          };
          
          # project specific environment variables or commands/aliases
          env.PROJECT_NAME = "Homebridge iBricks";
          scripts.hello.exec = ''
            cat <<EOF
            ## Welcome to a devenv setup for '$PROJECT_NAME'
               your repository is at DEVENV_ROOT [$DEVENV_ROOT]
               nix dependencies are symlinked to $DEVENV_DOTFILE
               available binaries: [$(cd $DEVENV_DOTFILE/profile/bin; echo *)]
            EOF
          '';
        };
      };
    };
}

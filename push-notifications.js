(() => {
  const APP_ID = "56e52691-81e9-4fec-84af-b74520c1d36f";
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: APP_ID,
        serviceWorkerPath: "painel-producao/push/onesignal/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/painel-producao/push/onesignal/" },
        notifyButton: { enable: true },
        welcomeNotification: { disable: true },
        allowLocalhostAsSecureOrigin: false,
      });

      const session = await window.PPAuth?.getSession?.();
      if (session?.user?.id) await OneSignal.login(session.user.id);

      const mountPermissionButton = () => {
        if (OneSignal.Notifications.permission) return;
        const host = document.querySelector(".connection-wrap");
        if (!host || document.getElementById("push-permission-button")) return;
        const button = document.createElement("button");
        button.id = "push-permission-button";
        button.type = "button";
        button.className = "button secondary";
        button.textContent = "🔔 Ativar alertas";
        button.onclick = async () => {
          await OneSignal.Notifications.requestPermission();
          if (OneSignal.Notifications.permission) button.remove();
        };
        host.insertBefore(button, document.getElementById("logout-button"));
      };
      mountPermissionButton();
      OneSignal.Notifications.addEventListener("permissionChange", (allowed) => {
        if (allowed) document.getElementById("push-permission-button")?.remove();
        else mountPermissionButton();
      });

      window.KodaPush = {
        requestPermission: () => OneSignal.Notifications.requestPermission(),
        permission: () => OneSignal.Notifications.permission,
      };
    } catch (error) {
      console.warn("KODA Push", error);
    }
  });
})();

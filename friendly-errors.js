(() => {
  function raw(error) {
    if (!error) return "";
    let message = String(error.message || error || "");
    try {
      const parsed = JSON.parse(message);
      message = parsed.message || parsed.error || parsed.details || message;
    } catch {}
    return message;
  }

  function message(error, fallback = "Não foi possível concluir esta ação.") {
    const text = raw(error).toLowerCase();
    if (!text) return fallback;
    if (text.includes("42501") || text.includes("permission denied") || text.includes("acesso negado"))
      return "Seu usuário não tem permissão para realizar esta ação. Entre novamente ou peça acesso ao administrador.";
    if (text.includes("23505") || text.includes("duplicate") || text.includes("unique constraint"))
      return "Este cadastro já existe. Confira o nome, SKU ou número informado.";
    if (text.includes("jwt") || text.includes("session") || text.includes("sessão"))
      return "Sua sessão expirou. Entre novamente para continuar.";
    if (text.includes("failed to fetch") || text.includes("network") || text.includes("offline"))
      return "Sem conexão com o servidor. Verifique a internet e tente novamente.";
    if (text.includes("foreign key") || text.includes("23503"))
      return "Este item está vinculado a outro cadastro e não pode ser alterado dessa forma.";
    return fallback;
  }

  window.BrindesOnErrors = { message, raw };
})();

const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testV1Beta() {
  const apiKey = "AIzaSyDFHTP2OK3NgsPlfVxu69yJTo2pTgrqbmM"; 
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Testando com gemini-3.5-flash na v1beta
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.5-flash" 
  }, { apiVersion: 'v1beta' });

  const systemInstructions = "Você é um assistente virtual.";
  const message = "Olá!";

  console.log("--- Testando v1beta com gemini-3.5-flash (USANDO systemInstruction CORRETAMENTE) ---");
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: message }] }],
      systemInstruction: { parts: [{ text: systemInstructions }] }
    });
    const response = await result.response;
    console.log("Resposta:", response.text());
    console.log("--- SUCESSO ---");
  } catch (error) {
    console.error("--- FALHA ---");
    console.error(error.message);
  }
}

testV1Beta();

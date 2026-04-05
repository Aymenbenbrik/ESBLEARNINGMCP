from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

# Initialisation de l'application Flask
app = Flask(__name__)

# Autorise Next.js (qui tourne sur un autre port) à faire des requêtes vers cette API
CORS(app) 

# URL officielle de l'API Piston (version 2)
PISTON_API_URL = "https://emkc.org/api/v2/piston/execute"

@app.route('/api/submit_code', methods=['POST'])
def submit_code():
    """
    Route qui reçoit le code de l'étudiant depuis Next.js, 
    ajoute les tests de validation, et l'envoie à Piston pour exécution.
    """
    # 1. Récupération des données envoyées par Next.js
    data = request.json
    if not data or 'code' not in data:
        return jsonify({"statut": "erreur_requete", "message": "Aucun code fourni."}), 400
        
    code_etudiant = data.get('code')
    
    # 2. Injection des tests cachés (Exemple : fonction addition)
    # Ces tests ne seront jamais vus par l'étudiant dans son navigateur
    tests_caches = """
# --- DÉBUT DES TESTS CACHÉS ---
try:
    assert addition(2, 3) == 5, "Test 1 échoué : 2+3 doit faire 5"
    assert addition(-1, 1) == 0, "Test 2 échoué : -1+1 doit faire 0"
    assert addition(0, 0) == 0, "Test 3 échoué : 0+0 doit faire 0"
    print("SUCCES_TOTAL")
except AssertionError as e:
    print(e)
except NameError:
    print("Erreur : La fonction 'addition' n'a pas été définie correctement.")
except Exception as e:
    print(f"Erreur inattendue : {e}")
"""

    # 3. Assemblage du code final
    code_final = code_etudiant + "\n" + tests_caches

    # 4. Configuration de la requête pour Piston
    payload = {
        "language": "python",
        "version": "3.10",
        "files": [
            {
                "name": "main.py",
                "content": code_final
            }
        ],
        "compile_timeout": 10000, # Temps max de compilation (ms)
        "run_timeout": 3000,      # Temps max d'exécution pour éviter les boucles infinies (ms)
    }

    # 5. Appel à l'API Piston
    try:
        response = requests.post(PISTON_API_URL, json=payload)
        
        # Si l'API Piston est inaccessible
        if response.status_code != 200:
            return jsonify({"statut": "erreur_piston", "message": "Le serveur d'exécution est indisponible."}), 502

        resultat = response.json()
        
        # 6. Analyse des résultats renvoyés par Piston
        run_output = resultat.get('run', {}).get('stdout', '').strip()
        run_error = resultat.get('run', {}).get('stderr', '').strip()
        
        # L'étudiant a fait une erreur de syntaxe (ex: indentation, faute de frappe)
        if run_error:
            return jsonify({"statut": "erreur_syntaxe", "message": run_error}), 400
            
        # Le code s'est exécuté et tous nos tests cachés sont passés
        elif "SUCCES_TOTAL" in run_output:
            return jsonify({"statut": "succes", "message": "Bravo ! Tous les tests sont passés avec succès."}), 200
            
        # Le code s'est exécuté, mais un de nos tests (assert) a échoué
        else:
            return jsonify({"statut": "echec_test", "message": run_output}), 400

    # Gestion des erreurs de votre propre serveur
    except Exception as e:
        return jsonify({"statut": "erreur_serveur", "message": f"Erreur interne : {str(e)}"}), 500

# Lancement du serveur en mode développement
if __name__ == '__main__':
    print("Démarrage du serveur d'évaluation Flask sur le port 5000...")
    app.run(debug=True, port=5000)
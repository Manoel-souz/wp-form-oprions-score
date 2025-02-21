// Garante que o jQuery está disponível antes de executar
(function($) {
    class WPFormsQuizScore {
        constructor() {
            console.group('🎯 WPForms Quiz Score - Inicialização');
            
            // Inicializa variáveis
            this.pontos = 0;
            this.totalPerguntas = 0;
            this.respostasCorretas = {};
            this.valorQuestao = 0;
            this.respostasAnteriores = {};
            
            // Busca as respostas do banco via AJAX
            this.carregarRespostasCorretas();
            
            // Inicializa eventos
            this.initEventos();
            this.initSaveScoreField();
            this.initScoreFieldSave();
            console.groupEnd();
        }

        carregarRespostasCorretas() {
            // Verifica se wpformsQuizData está disponível
            if (typeof wpformsQuizData === 'undefined') {
                console.error('❌ wpformsQuizData não está definido');
                return;
            }

            const FORM_ID = wpformsQuizData.formId;
            console.log('field_id: ', FORM_ID);

            // Busca o formulário e verifica se existe
            const form = document.querySelector('form.wpforms-form');
            if (!form) {
                console.error('❌ Formulário não encontrado');
                return;
            }

            // Obtém o ID do formulário
            const formId = form.dataset.formid || 
                          form.getAttribute('data-formid') || 
                          form.id.replace('wpforms-form-', '') ||
                          '8';

            console.log('🔧 Dados disponíveis:', {
                ajaxurl: wpformsQuizData.ajaxurl,
                nonce: wpformsQuizData.nonce,
                formId: formId
            });

            // Faz a requisição AJAX
            $.ajax({
                url: wpformsQuizData.ajaxurl,
                type: 'POST',
                dataType: 'json',
                data: {
                    action: 'get_quiz_answers',
                    form_id: formId,
                    nonce: wpformsQuizData.nonce
                },
                success: (response) => {
                    if (response && response.success) {
                        this.respostasCorretas = {};
                        
                        // Processa as respostas
                        Object.entries(response.data).forEach(([key, value]) => {
                            if (value.type === 'score_field') {
                                // Encontrou o campo de pontuação
                                wpformsQuizData.scoreFieldId = key;
                                console.log('📊 Campo de pontuação encontrado:', {
                                    id: key,
                                    tipo: value.type
                                });
                            } else {
                                // Adiciona às respostas corretas
                                this.respostasCorretas[key] = value.answer;
                            }
                        });
                        
                        console.log('✅ Respostas corretas carregadas:', this.respostasCorretas);
                        
                        if (wpformsQuizData.scoreFieldId) {
                            console.log('📊 ID do campo de pontuação:', wpformsQuizData.scoreFieldId);
                        } else {
                            console.warn('⚠️ Campo de pontuação não encontrado');
                        }
                    } else {
                        console.error('❌ Erro ao carregar respostas:', 
                            response ? response.data.message : 'Resposta inválida');
                    }
                },
                error: (error) => {
                    console.error('❌ Erro:', error);
                    this.showNotification('Erro ao carregar respostas', 'error');
                }
            });
        }

        initEventos() {
            // Para campos de rádio
            document.querySelectorAll('input[type="radio"]').forEach(input => {
                input.addEventListener('change', (e) => this.verificarResposta(e));
            });

            // Para campos select
            document.querySelectorAll('select').forEach(select => {
                select.addEventListener('change', (e) => this.verificarResposta(e));
            });
        }

        verificarResposta(event) {
            const input = event.target;
            const fieldId = this.getFieldId(input);
            const respostaSelecionada = input.value;
            
            // Calcula o valor de cada questão (nota máxima 10 dividida pelo número de questões)
            const totalQuestoes = Object.keys(this.respostasCorretas).length;
            this.valorQuestao = 10 / totalQuestoes;
            
            console.group('🔍 Verificando Resposta');
            console.log({
                campo: fieldId,
                selecionada: respostaSelecionada,
                correta: this.respostasCorretas[fieldId],
                valorQuestao: this.valorQuestao
            });

            // Remove pontos anteriores desta questão se houver
            if (this.respostasAnteriores && this.respostasAnteriores[fieldId]) {
                this.pontos -= this.respostasAnteriores[fieldId];
            }

            // Inicializa objeto de respostas anteriores se não existir
            if (!this.respostasAnteriores) {
                this.respostasAnteriores = {};
            }

            if (this.respostasCorretas[fieldId] === respostaSelecionada) {
                console.log('✅ Resposta correta!');
                this.marcarCorreta(input);
                this.respostasAnteriores[fieldId] = this.valorQuestao;
                this.pontos += this.valorQuestao;
            } else {
                console.log('❌ Resposta incorreta');
                this.marcarIncorreta(input);
                this.respostasAnteriores[fieldId] = 0;
            }

            this.atualizarPontuacao();
            console.groupEnd();
        }

        getFieldId(element) {
            // Extrai o ID do campo do nome do input
            const match = element.name.match(/wpforms\[fields\]\[(\d+)\]/);
            return match ? match[1] : null;
        }

        marcarCorreta(element) {
            const container = element.closest('.wpforms-field');
            container.classList.add('resposta-correta');
            container.classList.remove('resposta-incorreta');
        }

        marcarIncorreta(element) {
            const container = element.closest('.wpforms-field');
            container.classList.add('resposta-incorreta');
            container.classList.remove('resposta-correta');
        }

        atualizarPontuacao() {
            console.group('🎯 Atualizando Pontuação');
            
            const pontos = this.calcularPontuacao();
            const notaDecimal = Math.round(pontos * 10) / 10;
            const notaInteira = Math.round(notaDecimal);
            
            console.log('📊 Notas calculadas:', {
                decimal: notaDecimal,
                inteira: notaInteira
            });

            // Atualiza a div com o ID do campo de pontuação
            const scoreFieldId = wpformsQuizData.scoreFieldId;
            if (scoreFieldId) {
                // Tenta diferentes seletores para encontrar o elemento
                const scoreElement = document.querySelector(`#wpforms-${wpformsQuizData.formId}-field_${scoreFieldId}`) || 
                                   document.querySelector(`[data-field="${scoreFieldId}"]`) ||
                                   document.querySelector(`#wpforms-field-${scoreFieldId}`);

                if (scoreElement) {
                    console.log('✅ Atualizando elemento:', {
                        id: scoreElement.id,
                        valor: notaInteira
                    });
                    
                    // Atualiza o valor
                    scoreElement.textContent = notaInteira;
                    
                    // Se for um input, atualiza também o value
                    if (scoreElement.tagName === 'INPUT') {
                        scoreElement.value = notaInteira;
                        scoreElement.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } else {
                    console.error('❌ Elemento de pontuação não encontrado');
                }
            }
            
            // Atualiza os displays adicionais se existirem
            this.atualizarDisplays(notaDecimal);
            
            console.groupEnd();
        }

        calcularPontuacao() {
            console.group('🎯 Calculando Pontuação');
            
            // Obtém todos os campos de resposta do formulário
            const form = document.querySelector('form.wpforms-form');
            if (!form) {
                console.error('❌ Formulário não encontrado');
                console.groupEnd();
                return 0;
            }

            // Busca campos de resposta (radio e select)
            const camposResposta = form.querySelectorAll('input[type="radio"]:checked, select');
            const totalCampos = this.respostasCorretas ? Object.keys(this.respostasCorretas).length : 0;
            
            console.log('📊 Total de campos:', totalCampos);
            
            if (!totalCampos) {
                console.error('❌ Nenhuma resposta correta cadastrada');
                console.groupEnd();
                return 0;
            }

            let pontosAcumulados = 0;
            const valorPorQuestao = 10 / totalCampos; // Cada questão vale uma parte igual de 10
            
            camposResposta.forEach(campo => {
                const fieldId = this.getFieldId(campo);
                if (!fieldId) return;

                const respostaCorreta = this.respostasCorretas[fieldId];
                const respostaUsuario = campo.value;
                
                console.log('🔍 Verificando campo:', {
                    fieldId,
                    respostaUsuario,
                    respostaCorreta,
                    valorQuestao: valorPorQuestao
                });

                if (respostaCorreta && respostaUsuario === respostaCorreta) {
                    pontosAcumulados += valorPorQuestao;
                    console.log('✅ Resposta correta! Pontos acumulados:', pontosAcumulados);
                }
            });

            // Calcula a nota final (regra de 3)
            const notaFinal = (pontosAcumulados / totalCampos) * 10;
            
            console.log('📝 Resultado:', {
                acertos: pontosAcumulados,
                total: totalCampos,
                notaFinal: pontosAcumulados
            });
            
            console.groupEnd();
            return pontosAcumulados;
        }

        extrairFieldId(elemento) {
            // Tenta diferentes padrões para extrair o field_id
            const patterns = [
                /wpforms\[fields\]\[(\d+)\]/, // Padrão do name
                /wpforms-\d+-field_(\d+)/,    // Padrão do ID
                /field_(\d+)/                 // Padrão simplificado
            ];

            let fieldId = null;

            // Tenta pelo name primeiro
            if (elemento.name) {
                for (const pattern of patterns) {
                    const match = elemento.name.match(pattern);
                    if (match) {
                        fieldId = match[1];
                        break;
                    }
                }
            }

            // Se não encontrou pelo name, tenta pelo ID
            if (!fieldId && elemento.id) {
                for (const pattern of patterns) {
                    const match = elemento.id.match(pattern);
                    if (match) {
                        fieldId = match[1];
                        break;
                    }
                }
            }

            return fieldId;
        }

        initSaveScoreField() {
            // Quando o campo de pontuação é selecionado no admin
            const scoreFieldSelect = document.querySelector('#quiz_score_field');
            if (scoreFieldSelect) {
                scoreFieldSelect.addEventListener('change', (e) => {
                    this.saveScoreField(e.target.value);
                });
            }
        }

        saveScoreField(fieldId) {
            const formId = new URLSearchParams(window.location.search).get('form_id');
            console.group('🎯 Salvando Campo de Pontuação');
            console.log('Dados:', {
                formId: formId,
                fieldId: fieldId
            });

            if (!formId || !fieldId) {
                console.error('❌ IDs inválidos');
                console.groupEnd();
                return;
            }

            const data = new FormData();
            data.append('action', 'save_quiz_score_field');
            data.append('nonce', wpformsQuizData.nonce);
            data.append('form_id', formId);
            data.append('field_id', fieldId);

            fetch(wpformsQuizData.ajaxurl, {
                method: 'POST',
                body: data
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ Resposta do servidor:', data);
                } else {
                    console.error('❌ Erro do servidor:', data);
                }
                console.groupEnd();
            })
            .catch(error => {
                console.error('❌ Erro na requisição:', error);
                console.groupEnd();
            });
        }

        initScoreFieldSave() {
            console.log('🔍 Inicializando salvamento do campo');
            
            const saveButton = $('#save-score-field');
            const select = $('#quiz_score_field');
            
            if (saveButton.length && select.length) {
                saveButton.on('click', () => {
                    console.log('🔔 Botão clicado');
                    
                    const fieldId = select.val();
                    const formId = select.data('formId');
                    
                    if (!fieldId || !formId) {
                        console.error('❌ IDs inválidos');
                        return;
                    }
                    
                    const spinner = saveButton.next('.spinner');
                    saveButton.prop('disabled', true);
                    spinner.css('visibility', 'visible');
                    
                    $.ajax({
                        url: wpformsQuizData.ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'save_quiz_score_field',
                            nonce: wpformsQuizData.nonce,
                            form_id: formId,
                            field_id: fieldId
                        },
                        success: function(response) {
                            if (response.success) {
                                alert('Campo salvo com sucesso!');
                            } else {
                                alert('Erro ao salvar: ' + (response.data?.message || 'Erro desconhecido'));
                            }
                        },
                        error: function(error) {
                            console.error('❌ Erro:', error);
                            alert('Erro ao salvar campo');
                        },
                        complete: function() {
                            saveButton.prop('disabled', false);
                            spinner.css('visibility', 'hidden');
                        }
                    });
                });
            }
        }

        showNotification(message, type = 'success') {
            const notification = document.createElement('div');
            notification.className = `wpforms-notification wpforms-notification-${type}`;
            notification.style.cssText = `
                position: fixed;
                top: 32px;
                right: 20px;
                padding: 10px 20px;
                border-radius: 4px;
                background: ${type === 'success' ? '#46b450' : '#dc3232'};
                color: white;
                z-index: 9999;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            `;
            notification.textContent = message;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.5s ease';
                setTimeout(() => notification.remove(), 500);
            }, 3000);
        }

        atualizarDisplays(notaDecimal) {
            // Atualiza displays da pontuação
            const displays = document.querySelectorAll(`.quiz-score-display[data-form-id="${wpformsQuizData.formId}"]`);
            displays.forEach(display => {
                display.textContent = notaDecimal;
            });
        }
    }

    // Inicializa quando o documento estiver pronto
    $(document).ready(() => {
        new WPFormsQuizScore();
    });

    // Adicione isso dentro do método add_settings_script()
    $('#save-quiz-settings').on('click', function(e) {
        e.preventDefault();
        
        var $button = $(this);
        var $spinner = $button.next('.spinner');
        
        // Desabilita o botão e mostra o spinner
        $button.prop('disabled', true);
        $spinner.css('visibility', 'visible');
        
        // Coleta todas as respostas selecionadas
        var settings = {};
        $('.quiz-question-settings select').each(function() {
            var name = $(this).attr('name');
            var value = $(this).val();
            if (value) { // Só envia se tiver valor selecionado
                settings[name] = value;
            }
        });
        
        // Debug
        console.group('💾 Salvando Configurações Quiz');
        console.log('Settings:', settings);
        
        // Envia para o servidor
        $.ajax({
            url: wpformsQuizData.ajaxurl,
            type: 'POST',
            data: {
                action: 'save_quiz_settings',
                settings: settings,
                nonce: wpformsQuizData.nonce
            },
            success: function(response) {
                console.log('Resposta:', response);
                if (response.success) {
                    alert('Configurações salvas com sucesso!');
                } else {
                    alert('Erro ao salvar configurações: ' + response.data.message);
                }
            },
            error: function(error) {
                console.error('Erro Ajax:', error);
                alert('Erro ao salvar configurações: ' + error);
            },
            complete: function() {
                // Reabilita o botão e esconde o spinner
                $button.prop('disabled', false);
                $spinner.css('visibility', 'hidden');
                console.groupEnd();
            }
        });
    });
})(jQuery); 